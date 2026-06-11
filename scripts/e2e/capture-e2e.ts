/**
 * End-to-end test of the call-capture pipeline (CALL-CAPTURE-MODULE-V1)
 * against a RUNNING dev server + real Deepgram + real Claude, with the DB
 * pinned to the disposable local test Postgres.
 *
 * Usage:
 *   1. bash scripts/test-db.sh
 *   2. DATABASE_URL=postgresql://agb@localhost:54329/agb_test \
 *      AGB_INTEGRATION_TEST_DB=1 AGB_DEV_FAKE_USER=1 npm run dev   # port 3000
 *   3. bash scripts/e2e/make-call-audio.sh /tmp/agb-e2e-audio/call-stereo.wav
 *   4. DATABASE_URL=postgresql://agb@localhost:54329/agb_test \
 *      AGB_INTEGRATION_TEST_DB=1 npx tsx scripts/e2e/capture-e2e.ts
 *
 * Exercises: token mint/ping → session → chunked upload → finalize (Deepgram
 * dual-channel + Claude filing + contact attach) → detail/audio routes →
 * missing-chunk 409 + resume → idempotent finalize → abandon (TRG-7) →
 * crash-salvage sweep (OPS-5) → retention purge (RET-1). Maps to launch gates
 * G4, G6 (server half), G7 (server half), G8, G9.
 */
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { parseWavHeader, buildWavHeader } from "../../lib/capture/wav";

const BASE = process.env.AGB_E2E_BASE_URL ?? "http://localhost:3000";
const AUDIO = process.env.AGB_E2E_AUDIO ?? "/tmp/agb-e2e-audio/call-stereo.wav";
const FAKE_USER_ID = "00000000-0000-0000-0000-000000000000";
const FAKE_WORKSPACE_ID = "00000000-0000-0000-0000-0000000000aa";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : "");
  }
}

function chunkWav(buf: Uint8Array, chunkSecs = 30): Uint8Array[] {
  const info = parseWavHeader(buf);
  if (!info) throw new Error("bad source wav");
  const bytesPerSec = info.sampleRate * info.channels * 2;
  const data = buf.subarray(info.dataOffset, info.dataOffset + info.dataBytes);
  const chunkBytes = chunkSecs * bytesPerSec;
  const out: Uint8Array[] = [];
  for (let off = 0; off < data.length; off += chunkBytes) {
    const slice = data.subarray(off, Math.min(off + chunkBytes, data.length));
    const header = buildWavHeader({
      sampleRate: info.sampleRate,
      channels: info.channels,
      dataBytes: slice.length,
    });
    const chunk = new Uint8Array(44 + slice.length);
    chunk.set(header, 0);
    chunk.set(slice, 44);
    out.push(chunk);
  }
  return out;
}

async function api(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* redirects / empty bodies */
  }
  return { status: res.status, json };
}

async function startSession(token: string, sourceApp: string): Promise<string> {
  const res = await api(
    "/api/capture/sessions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startedAt: new Date().toISOString(),
        sourceApp,
        sampleRate: 16000,
        channels: 2,
        format: "wav-pcm16",
        helperVersion: "e2e-driver",
      }),
    },
    token,
  );
  if (res.status !== 201) throw new Error(`session create failed: ${res.status}`);
  return res.json.sessionId as string;
}

async function putChunk(token: string, sessionId: string, seq: number, bytes: Uint8Array) {
  // Mirror the Helper's contract obligation: retry failed chunk uploads
  // (idempotent overwrite makes this safe).
  let last: { status: number; json: Record<string, unknown> } = { status: 0, json: {} };
  for (let attempt = 0; attempt < 3; attempt++) {
    last = await api(
      `/api/capture/sessions/${sessionId}/chunks/${seq}`,
      { method: "PUT", headers: { "Content-Type": "audio/wav" }, body: Buffer.from(bytes) },
      token,
    );
    if (last.status === 200) return last;
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  return last;
}

async function finalize(
  token: string,
  sessionId: string,
  totalChunks: number,
  extra: Record<string, unknown> = {},
) {
  return api(
    `/api/capture/sessions/${sessionId}/finalize`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endedAt: new Date().toISOString(),
        durationSecs: 56,
        totalChunks,
        ...extra,
      }),
    },
    token,
  );
}

async function main() {
  const { users, workspaces, workspaceMembers, contacts, callRecordings, captureSessions } =
    schema;

  console.log("— Setup: fake founder + workspace + contact in local test DB");
  // Idempotent re-runs: wipe this workspace's capture state. A second
  // "Carlos Mendoza" would make the contact match ambiguous — which the
  // pipeline correctly refuses to attach (FR-CALL-DST-4).
  await db.delete(captureSessions).where(eq(captureSessions.workspaceId, FAKE_WORKSPACE_ID)).catch(() => {});
  await db.delete(callRecordings).where(eq(callRecordings.workspaceId, FAKE_WORKSPACE_ID)).catch(() => {});
  await db.delete(contacts).where(eq(contacts.workspaceId, FAKE_WORKSPACE_ID)).catch(() => {});
  await db
    .insert(users)
    .values({ id: FAKE_USER_ID, email: "test@local", displayName: "Tomas Test" })
    .onConflictDoNothing();
  await db
    .insert(workspaces)
    .values({ id: FAKE_WORKSPACE_ID, name: "Test Workspace", createdBy: FAKE_USER_ID })
    .onConflictDoNothing();
  await db
    .insert(workspaceMembers)
    .values({ workspaceId: FAKE_WORKSPACE_ID, userId: FAKE_USER_ID, role: "owner" })
    .onConflictDoNothing();
  await db
    .update(users)
    .set({ currentWorkspaceId: FAKE_WORKSPACE_ID, displayName: "Tomas Test" })
    .where(eq(users.id, FAKE_USER_ID));
  await db
    .insert(contacts)
    .values({
      workspaceId: FAKE_WORKSPACE_ID,
      createdBy: FAKE_USER_ID,
      name: "Carlos Mendoza",
      type: "person",
    })
    .onConflictDoNothing();

  console.log("— Token mint + ping (NFR-CALL-SEC-2)");
  const mint = await api("/api/capture/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "E2E driver" }),
  });
  check("mint returns agbcap_ token once", mint.status === 201 && /^agbcap_/.test(String(mint.json.token)), mint);
  const token = mint.json.token as string;

  const ping = await api("/api/capture/ping", {}, token);
  check("ping resolves workspace", ping.status === 200 && ping.json.workspaceId === FAKE_WORKSPACE_ID, ping);
  const badPing = await api("/api/capture/ping", {}, "agbcap_" + "0".repeat(64));
  check("bad token rejected 401", badPing.status === 401);

  console.log("— Happy path: session → chunks → finalize (G4 bilingual)");
  const wav = new Uint8Array(fs.readFileSync(AUDIO));
  const chunks = chunkWav(wav);
  console.log(`  (audio: ${wav.length} bytes → ${chunks.length} chunks)`);
  check("multi-chunk call (>=2 chunks)", chunks.length >= 2);

  const s1 = await startSession(token, "E2E-Sim");
  for (let i = 0; i < chunks.length; i++) {
    const r = await putChunk(token, s1, i, chunks[i]);
    if (r.status !== 200) check(`chunk ${i} upload`, false, r);
  }
  check("all chunks uploaded", true);

  const t0 = Date.now();
  const fin = await finalize(token, s1, chunks.length, { contactName: "Carlos" });
  const finSecs = Math.round((Date.now() - t0) / 1000);
  check("finalize ok", fin.status === 200 && fin.json.ok === true, fin);
  console.log(`  (finalize took ${finSecs}s — transcribe + file)`);
  const recordingId = fin.json.recordingId as string;
  check("recordingId returned", typeof recordingId === "string" && recordingId.length > 10);
  check("title generated", typeof fin.json.title === "string" && (fin.json.title as string).length > 3, fin.json.title);
  check("brief generated", typeof fin.json.brief === "string" && (fin.json.brief as string).length > 20);
  check(
    "action items extracted (call contains 4 explicit commitments)",
    (fin.json.actionItemCount as number) >= 2,
    fin.json.actionItemCount,
  );
  check(
    "contact attached (FR-CALL-DST-4)",
    (fin.json.contact as { name?: string } | null)?.name === "Carlos Mendoza",
    fin.json.contact,
  );
  check("no suspect flags on a clean call", (fin.json.suspectFlags as string[]).length === 0, fin.json.suspectFlags);

  console.log("— Recording detail (ATT-1/2, RET-2)");
  const detail = await api(`/api/voice/recording/${recordingId}`);
  check("detail loads", detail.status === 200);
  const utts = (detail.json.utterances ?? []) as { channel: number; speaker: string; text: string }[];
  check("utterances present", utts.length >= 4, utts.length);
  const founderUtts = utts.filter((u) => u.channel === 0);
  const partUtts = utts.filter((u) => u.channel === 1);
  check("both channels attributed", founderUtts.length >= 2 && partUtts.length >= 2, {
    founder: founderUtts.length,
    participant: partUtts.length,
  });
  const founderText = founderUtts.map((u) => u.text).join(" ").toLowerCase();
  const partText = partUtts.map((u) => u.text).join(" ").toLowerCase();
  check(
    "founder channel is the English speaker (ATT-1 ≥95%)",
    founderText.includes("payment schedule") && !partText.includes("payment schedule"),
    { founderText: founderText.slice(0, 120), partText: partText.slice(0, 120) },
  );
  check("participant channel caught the Spanish (TRX-4)", /contrato|viernes|tarifa/.test(partText), partText.slice(0, 160));
  // Two distinct speaker labels, dialogue line format, and the participant
  // side labeled with the matched contact's name (FR-CALL-ATT-2/3). The
  // founder label is the CRM user's first name — "Dev" for the dev fake user.
  const transcriptText = String(detail.json.transcript);
  const labelSet = new Set(
    [...transcriptText.matchAll(/^\[\d\d:\d\d\] ([^:]+):/gm)].map((m) => m[1]),
  );
  check(
    "dialogue transcript has 2 speaker labels incl. contact name",
    labelSet.size === 2 && labelSet.has("Carlos"),
    [...labelSet],
  );
  check("audio retained with purge date (RET-1)", detail.json.hasAudio === true && Boolean(detail.json.audioPurgeAt));
  check("channels=2 recorded", detail.json.channels === 2);
  check("sourceApp persisted", detail.json.sourceApp === "E2E-Sim");

  const audio = await api(`/api/voice/recording/${recordingId}/audio`);
  check("audio playback route redirects to signed URL", audio.status === 302 || audio.status === 307, audio.status);

  console.log("— Idempotent finalize retry");
  const again = await finalize(token, s1, chunks.length, { contactName: "Carlos" });
  check(
    "re-finalize returns same recording, no double-filing",
    again.status === 200 && again.json.recordingId === recordingId && again.json.alreadyFiled === true,
    again.json,
  );

  console.log("— Missing-chunk 409 + resume (G6 server half)");
  const s2 = await startSession(token, "E2E-Gap");
  await putChunk(token, s2, 0, chunks[0]);
  // upload chunk 2 but not 1 → finalize expects 3
  await putChunk(token, s2, 2, chunks[1]);
  const gap = await finalize(token, s2, 3);
  check("finalize reports missing seq 1", gap.status === 409 && Array.isArray(gap.json.missing) && (gap.json.missing as number[]).includes(1), gap.json);
  await putChunk(token, s2, 1, chunks[1]);
  const resumed = await finalize(token, s2, 3);
  check("finalize succeeds after gap fill", resumed.status === 200 && resumed.json.ok === true, resumed.json);

  console.log("— Abandon / decline (G8, FR-CALL-TRG-7)");
  const s3 = await startSession(token, "E2E-Abandon");
  await putChunk(token, s3, 0, chunks[0]);
  const abandon = await api(`/api/capture/sessions/${s3}`, { method: "DELETE" }, token);
  check("abandon ok", abandon.status === 200);
  const [s3row] = await db.select().from(captureSessions).where(eq(captureSessions.id, s3));
  check("session marked abandoned", s3row?.status === "abandoned");
  const postAbandonFinalize = await finalize(token, s3, 1);
  check("abandoned session cannot finalize", postAbandonFinalize.status === 409);
  const abandonedRecordings = await db
    .select()
    .from(callRecordings)
    .where(eq(callRecordings.workspaceId, FAKE_WORKSPACE_ID));
  check(
    "no recording row from abandoned session (zero artifacts)",
    !abandonedRecordings.some((r) => r.sourceApp === "E2E-Abandon"),
  );

  console.log("— Crash salvage sweep (G7 server half, FR-CALL-OPS-5)");
  const s4 = await startSession(token, "E2E-Crash");
  await putChunk(token, s4, 0, chunks[0]);
  await putChunk(token, s4, 1, chunks[1]);
  // no finalize — simulate helper death; rewind the heartbeat to look stale
  await db
    .update(captureSessions)
    .set({ lastChunkAt: new Date(Date.now() - 45 * 60 * 1000) })
    .where(eq(captureSessions.id, s4));
  const sweep1 = await api("/api/cron/audio-purge");
  check("cron sweep ran", sweep1.status === 200, sweep1.json);
  check("crashed session salvaged", (sweep1.json.salvaged as number) >= 1, sweep1.json);
  const [s4row] = await db.select().from(captureSessions).where(eq(captureSessions.id, s4));
  check("salvaged session filed + partial", s4row?.status === "filed" && s4row?.partial === true, s4row?.status);
  if (s4row?.recordingId) {
    const [salvRec] = await db
      .select()
      .from(callRecordings)
      .where(eq(callRecordings.id, s4row.recordingId));
    check("salvaged recording flagged partial (FR-CALL-OPS-5)", salvRec?.partial === true);
  }

  console.log("— Retention purge (G9, FR-CALL-RET-1/2)");
  await db
    .update(callRecordings)
    .set({ audioPurgeAt: new Date(Date.now() - 60 * 60 * 1000) })
    .where(eq(callRecordings.id, recordingId));
  const sweep2 = await api("/api/cron/audio-purge");
  check("purge cron ok", sweep2.status === 200, sweep2.json);
  check("audio purged", (sweep2.json.purged as number) >= 1, sweep2.json);
  const afterPurge = await api(`/api/voice/recording/${recordingId}`);
  check("transcript survives purge", String(afterPurge.json.transcript).length > 50);
  check("detail shows purged state", afterPurge.json.hasAudio === false && Boolean(afterPurge.json.audioPurgedAt));
  const audioGone = await api(`/api/voice/recording/${recordingId}/audio`);
  check("audio route returns 410 Gone after purge", audioGone.status === 410, audioGone.status);

  console.log("— Delete recording (FR-CALL-ACC-6)");
  const del = await api(`/api/voice/recording/${recordingId}`, { method: "DELETE" });
  check("delete ok", del.status === 200);
  const afterDel = await api(`/api/voice/recording/${recordingId}`);
  check("recording gone", afterDel.status === 404);

  console.log(`\nE2E RESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E driver crashed:", e);
  process.exit(1);
});
