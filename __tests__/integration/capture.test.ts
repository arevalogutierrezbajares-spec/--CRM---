import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  hashToken,
  mintTokenPlaintext,
  resolveCaptureToken,
} from "@/lib/capture/tokens";
import {
  insertCaptureToken,
  listCaptureTokens,
  revokeCaptureToken,
} from "@/db/queries/capture-tokens";
import {
  createCaptureSession,
  getCaptureSession,
  recordChunkHeartbeat,
  claimSessionForFinalize,
  reclaimFailedSession,
  updateCaptureSession,
  listStaleRecordingSessions,
  listPurgeableRecordings,
  markAudioPurged,
  getWorkspaceRetentionDays,
} from "@/db/queries/capture-sessions";
import {
  createCallRecording,
  getCallRecording,
  deleteCallRecording,
  listCallRecordings,
} from "@/db/queries/call-recordings";
import { FAKE_USER_ID, FAKE_WORKSPACE_ID } from "./setup";

const { captureSessions } = schema;

describe("[integration] capture tokens (NFR-CALL-SEC-2)", () => {
  it("mints → resolves → revokes", async () => {
    const plaintext = mintTokenPlaintext();
    expect(plaintext).toMatch(/^agbcap_[0-9a-f]{64}$/);

    const id = await insertCaptureToken({
      workspaceId: FAKE_WORKSPACE_ID,
      userId: FAKE_USER_ID,
      name: "Test Helper",
      tokenHash: hashToken(plaintext),
    });

    const identity = await resolveCaptureToken(`Bearer ${plaintext}`);
    expect(identity).not.toBeNull();
    expect(identity!.workspaceId).toBe(FAKE_WORKSPACE_ID);
    expect(identity!.userId).toBe(FAKE_USER_ID);

    const revoked = await revokeCaptureToken({ id, workspaceId: FAKE_WORKSPACE_ID });
    expect(revoked).toBe(true);
    expect(await resolveCaptureToken(`Bearer ${plaintext}`)).toBeNull();

    const list = await listCaptureTokens({ workspaceId: FAKE_WORKSPACE_ID });
    expect(list).toHaveLength(1);
    expect(list[0].revokedAt).not.toBeNull();
  });

  it("rejects malformed and unknown tokens", async () => {
    expect(await resolveCaptureToken(null)).toBeNull();
    expect(await resolveCaptureToken("Bearer nope")).toBeNull();
    expect(await resolveCaptureToken(`Bearer agbcap_${"0".repeat(64)}`)).toBeNull();
  });
});

describe("[integration] capture session lifecycle (NFR-CALL-OBS-1)", () => {
  async function makeSession() {
    return createCaptureSession({
      workspaceId: FAKE_WORKSPACE_ID,
      createdBy: FAKE_USER_ID,
      startedAt: new Date(),
      sourceApp: "WhatsApp",
    });
  }

  it("creates a session and records chunk heartbeats monotonically", async () => {
    const id = await makeSession();
    await recordChunkHeartbeat({ id, workspaceId: FAKE_WORKSPACE_ID, seq: 0 });
    await recordChunkHeartbeat({ id, workspaceId: FAKE_WORKSPACE_ID, seq: 2 });
    // Out-of-order retry of seq 1 must not regress the high-water mark.
    await recordChunkHeartbeat({ id, workspaceId: FAKE_WORKSPACE_ID, seq: 1 });

    const session = await getCaptureSession({ id, workspaceId: FAKE_WORKSPACE_ID });
    expect(session!.lastChunkSeq).toBe(2);
    expect(session!.lastChunkAt).not.toBeNull();
    expect(session!.status).toBe("recording");
  });

  it("finalize claim is exactly-once (FR finalize idempotency)", async () => {
    const id = await makeSession();
    const first = await claimSessionForFinalize({ id, workspaceId: FAKE_WORKSPACE_ID });
    const second = await claimSessionForFinalize({ id, workspaceId: FAKE_WORKSPACE_ID });
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("failed sessions can be reclaimed for retry; filed/abandoned cannot", async () => {
    const id = await makeSession();
    await claimSessionForFinalize({ id, workspaceId: FAKE_WORKSPACE_ID });
    await updateCaptureSession({
      id,
      workspaceId: FAKE_WORKSPACE_ID,
      patch: { status: "failed", error: "boom" },
    });
    expect(await reclaimFailedSession({ id, workspaceId: FAKE_WORKSPACE_ID })).toBe(true);

    await updateCaptureSession({
      id,
      workspaceId: FAKE_WORKSPACE_ID,
      patch: { status: "abandoned" },
    });
    expect(await reclaimFailedSession({ id, workspaceId: FAKE_WORKSPACE_ID })).toBe(false);
    expect(await claimSessionForFinalize({ id, workspaceId: FAKE_WORKSPACE_ID })).toBe(false);
  });

  it("stale-recording sweep finds only stale `recording` sessions (FR-CALL-OPS-5)", async () => {
    const staleId = await makeSession();
    const freshId = await makeSession();
    const filedId = await makeSession();

    const old = new Date(Date.now() - 60 * 60 * 1000);
    await db
      .update(captureSessions)
      .set({ lastChunkAt: old })
      .where(eq(captureSessions.id, staleId));
    await recordChunkHeartbeat({ id: freshId, workspaceId: FAKE_WORKSPACE_ID, seq: 0 });
    await db
      .update(captureSessions)
      .set({ status: "filed", lastChunkAt: old })
      .where(eq(captureSessions.id, filedId));

    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    const stale = await listStaleRecordingSessions({ olderThan: cutoff });
    const ids = stale.map((s) => s.id);
    expect(ids).toContain(staleId);
    expect(ids).not.toContain(freshId);
    expect(ids).not.toContain(filedId);
  });

  it("workspace isolation: foreign workspace can't read or claim", async () => {
    const id = await makeSession();
    const foreign = "00000000-0000-0000-0000-0000000000bb";
    expect(await getCaptureSession({ id, workspaceId: foreign })).toBeNull();
    expect(await claimSessionForFinalize({ id, workspaceId: foreign })).toBe(false);
  });
});

describe("[integration] capture recordings + retention (FR-CALL-RET-1/2, ACC-6)", () => {
  it("stores capture fields and surfaces them in the list", async () => {
    const recordingId = await createCallRecording({
      workspaceId: FAKE_WORKSPACE_ID,
      createdBy: FAKE_USER_ID,
      transcript: "[00:00] Tomas: Hola\n[00:03] Carlos: Buenas",
      durationSecs: 95,
      language: "multi",
      audioPath: `${FAKE_WORKSPACE_ID}/calls/test.wav`,
      audioBytes: 1234,
      audioPurgeAt: new Date(Date.now() + 30 * 86400 * 1000),
      channels: 2,
      sourceApp: "Zoom",
      utterances: [
        { speaker: "founder", channel: 0, start: 0, end: 2, text: "Hola" },
        { speaker: "participant", channel: 1, start: 3, end: 5, text: "Buenas" },
      ],
      suspectFlags: null,
      partial: false,
    });

    const rec = await getCallRecording({
      id: recordingId,
      workspaceId: FAKE_WORKSPACE_ID,
    });
    expect(rec!.channels).toBe(2);
    expect(rec!.utterances).toHaveLength(2);
    expect(rec!.audioPath).toContain("/calls/");

    const list = await listCallRecordings({ workspaceId: FAKE_WORKSPACE_ID });
    const item = list.find((r) => r.id === recordingId)!;
    expect(item.hasAudio).toBe(true);
    expect(item.sourceApp).toBe("Zoom");
    expect(item.partial).toBe(false);
    expect(item.suspectFlags).toEqual([]);
  });

  it("purge queries: past-due audio is listed, purging stamps + clears path", async () => {
    const dueId = await createCallRecording({
      workspaceId: FAKE_WORKSPACE_ID,
      createdBy: FAKE_USER_ID,
      transcript: "x",
      audioPath: `${FAKE_WORKSPACE_ID}/calls/due.wav`,
      audioPurgeAt: new Date(Date.now() - 1000),
      channels: 2,
    });
    const notDueId = await createCallRecording({
      workspaceId: FAKE_WORKSPACE_ID,
      createdBy: FAKE_USER_ID,
      transcript: "y",
      audioPath: `${FAKE_WORKSPACE_ID}/calls/notdue.wav`,
      audioPurgeAt: new Date(Date.now() + 86400 * 1000),
      channels: 2,
    });

    const due = await listPurgeableRecordings({ now: new Date() });
    const dueIds = due.map((r) => r.id);
    expect(dueIds).toContain(dueId);
    expect(dueIds).not.toContain(notDueId);

    await markAudioPurged({ id: dueId, workspaceId: FAKE_WORKSPACE_ID });
    const after = await getCallRecording({ id: dueId, workspaceId: FAKE_WORKSPACE_ID });
    expect(after!.audioPath).toBeNull();
    expect(after!.audioPurgedAt).not.toBeNull();
    // Re-listing no longer includes it (catch-up runs stay idempotent).
    const again = await listPurgeableRecordings({ now: new Date() });
    expect(again.map((r) => r.id)).not.toContain(dueId);
  });

  it("delete removes the row and reports the audio path for object cleanup", async () => {
    const id = await createCallRecording({
      workspaceId: FAKE_WORKSPACE_ID,
      createdBy: FAKE_USER_ID,
      transcript: "to delete",
      audioPath: `${FAKE_WORKSPACE_ID}/calls/del.wav`,
      channels: 2,
    });
    const res = await deleteCallRecording({ id, workspaceId: FAKE_WORKSPACE_ID });
    expect(res.deleted).toBe(true);
    expect(res.audioPath).toContain("del.wav");
    expect(await getCallRecording({ id, workspaceId: FAKE_WORKSPACE_ID })).toBeNull();
  });

  it("retention setting defaults to 30 and is workspace-scoped", async () => {
    expect(await getWorkspaceRetentionDays(FAKE_WORKSPACE_ID)).toBe(30);
  });
});
