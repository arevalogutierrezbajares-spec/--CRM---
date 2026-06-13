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
  reclaimStaleFinalizingSession,
  listStaleFinalizingSessions,
  abandonSession,
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

  it("a fresh `finalizing` lease is NOT reclaimable; an expired one IS (crash recovery)", async () => {
    // This is the bug that wedged the 77-min WhatsApp call: a finalize that
    // crashed (OOM) left the session in `finalizing` forever. The lease makes a
    // dead claim recoverable while never stealing a genuinely in-flight one.
    const id = await makeSession();
    expect(await claimSessionForFinalize({ id, workspaceId: FAKE_WORKSPACE_ID })).toBe(true);

    // Lease just stamped → a 20-min-old cutoff must NOT reclaim it.
    const freshCutoff = new Date(Date.now() - 20 * 60 * 1000);
    expect(
      await reclaimStaleFinalizingSession({
        id,
        workspaceId: FAKE_WORKSPACE_ID,
        leaseCutoff: freshCutoff,
      }),
    ).toBe(false);

    // Backdate the lease to simulate a finalize that died 30 min ago.
    await db
      .update(captureSessions)
      .set({ finalizeStartedAt: new Date(Date.now() - 30 * 60 * 1000) })
      .where(eq(captureSessions.id, id));
    expect(
      await reclaimStaleFinalizingSession({
        id,
        workspaceId: FAKE_WORKSPACE_ID,
        leaseCutoff: freshCutoff,
      }),
    ).toBe(true);

    // Reclaim re-stamps the lease, so an immediate second reclaim fails again
    // (only one retrier wins — no double finalize).
    expect(
      await reclaimStaleFinalizingSession({
        id,
        workspaceId: FAKE_WORKSPACE_ID,
        leaseCutoff: freshCutoff,
      }),
    ).toBe(false);
  });

  it("stale-finalizing sweep finds only lease-expired `finalizing` sessions", async () => {
    const wedgedId = await makeSession();
    const inflightId = await makeSession();
    await claimSessionForFinalize({ id: wedgedId, workspaceId: FAKE_WORKSPACE_ID });
    await claimSessionForFinalize({ id: inflightId, workspaceId: FAKE_WORKSPACE_ID });
    // wedged: lease 30 min old (crashed); inflight: lease just now (running).
    await db
      .update(captureSessions)
      .set({ finalizeStartedAt: new Date(Date.now() - 30 * 60 * 1000) })
      .where(eq(captureSessions.id, wedgedId));

    const cutoff = new Date(Date.now() - 20 * 60 * 1000);
    const ids = (await listStaleFinalizingSessions({ olderThan: cutoff })).map(
      (s) => s.id,
    );
    expect(ids).toContain(wedgedId);
    expect(ids).not.toContain(inflightId);
  });

  it("a filed `finalizing` session is never swept (already produced a recording)", async () => {
    // recordingId set → listStaleFinalizingSessions must ignore it even if the
    // lease looks old, so the sweep can't double-file.
    const id = await makeSession();
    await claimSessionForFinalize({ id, workspaceId: FAKE_WORKSPACE_ID });
    await db
      .update(captureSessions)
      .set({
        finalizeStartedAt: new Date(Date.now() - 60 * 60 * 1000),
        recordingId: null, // ensure column exists; then set a real-ish one below
      })
      .where(eq(captureSessions.id, id));
    // Give it a recordingId via a real recording row to satisfy the FK.
    const recId = await createCallRecording({
      workspaceId: FAKE_WORKSPACE_ID,
      createdBy: FAKE_USER_ID,
      transcript: "x",
    });
    await db
      .update(captureSessions)
      .set({ recordingId: recId })
      .where(eq(captureSessions.id, id));

    const cutoff = new Date(Date.now() - 20 * 60 * 1000);
    const ids = (await listStaleFinalizingSessions({ olderThan: cutoff })).map(
      (s) => s.id,
    );
    expect(ids).not.toContain(id);
  });

  it("abandon vs finalize is mutually exclusive (FR-CALL-TRG-7 race)", async () => {
    // A session already claimed for finalize cannot be abandoned — closes the
    // race where off-the-record audio gets resurrected into a filed recording.
    const claimedId = await makeSession();
    expect(await claimSessionForFinalize({ id: claimedId, workspaceId: FAKE_WORKSPACE_ID })).toBe(true);
    expect(await abandonSession({ id: claimedId, workspaceId: FAKE_WORKSPACE_ID })).toBe(false);
    const stillFinalizing = await getCaptureSession({ id: claimedId, workspaceId: FAKE_WORKSPACE_ID });
    expect(stillFinalizing!.status).toBe("finalizing");

    // Conversely, once abandoned, finalize cannot claim it.
    const abandonId = await makeSession();
    expect(await abandonSession({ id: abandonId, workspaceId: FAKE_WORKSPACE_ID })).toBe(true);
    expect(await claimSessionForFinalize({ id: abandonId, workspaceId: FAKE_WORKSPACE_ID })).toBe(false);
    const abandoned = await getCaptureSession({ id: abandonId, workspaceId: FAKE_WORKSPACE_ID });
    expect(abandoned!.status).toBe("abandoned");

    // A failed session can still be abandoned (it's recoverable, not finalizing).
    const failedId = await makeSession();
    await claimSessionForFinalize({ id: failedId, workspaceId: FAKE_WORKSPACE_ID });
    await updateCaptureSession({ id: failedId, workspaceId: FAKE_WORKSPACE_ID, patch: { status: "failed" } });
    expect(await abandonSession({ id: failedId, workspaceId: FAKE_WORKSPACE_ID })).toBe(true);
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
