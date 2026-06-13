#!/usr/bin/env tsx
/**
 * One-off rescue for a capture session whose finalize crashed server-side
 * (HTTP 500 → wedged in `finalizing`, helper looping on 409 forever).
 *
 * Runs the REAL finalize pipeline (lib/capture/finalize.ts) locally, where
 * there's no serverless memory/time cap — assemble (~295 MB for a 77-min call)
 * + Deepgram dual-channel transcription + durable recording row + AI filing +
 * chunk cleanup. Identical artifact to a clean finalize.
 *
 *   env -u DATABASE_URL npx tsx scripts/rescue-session.ts <sessionId> [--founder "Tomas"] [--contact "Name"]
 *
 * Idempotent: a session already `filed` is left alone.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { finalizeSession } from "@/lib/capture/finalize";
import { listSessionChunks } from "@/lib/capture/storage";

const { captureSessions } = schema;

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const sessionId = process.argv[2];
  if (!sessionId || sessionId.startsWith("--")) {
    console.error("usage: rescue-session.ts <sessionId> [--founder NAME] [--contact NAME]");
    process.exit(1);
  }
  const founderLabel = arg("--founder") ?? "Tomas";
  const contactName = arg("--contact") ?? null;

  const [session] = await db
    .select()
    .from(captureSessions)
    .where(eq(captureSessions.id, sessionId))
    .limit(1);

  if (!session) {
    console.error(`✗ session ${sessionId} not found`);
    process.exit(1);
  }
  console.log(`session ${session.id}`);
  console.log(`  status     : ${session.status}`);
  console.log(`  workspace  : ${session.workspaceId}`);
  console.log(`  createdBy  : ${session.createdBy}`);
  console.log(`  sourceApp  : ${session.sourceApp}`);
  console.log(`  recordingId: ${session.recordingId ?? "(none)"}`);

  if (session.status === "filed" && session.recordingId) {
    console.log(`✓ already filed → recording ${session.recordingId}; nothing to do`);
    process.exit(0);
  }

  // How many chunks are actually in storage — this is our authoritative count.
  const chunks = await listSessionChunks(session.workspaceId, session.id);
  console.log(`  chunks in storage: ${chunks.length}`);
  if (chunks.length === 0) {
    console.error("✗ no chunks in storage — cannot rescue from server side");
    process.exit(1);
  }

  console.log(`\nRunning finalizeSession (founder="${founderLabel}", contact=${contactName ?? "—"})…`);
  const t0 = Date.now();
  const outcome = await finalizeSession({
    session,
    founderLabel,
    endedAt: session.endedAt ?? new Date(),
    durationSecs: session.durationSecs ?? null,
    // Pass the real storage count so the missing-chunk guard is satisfied
    // (the helper never got to send a totalChunks the server trusted).
    totalChunks: chunks.length,
    partial: false,
    contactName,
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  if (!outcome.ok) {
    console.error(`\n✗ finalize failed (${secs}s): [${outcome.status}] ${outcome.error}`);
    if (outcome.missing?.length) console.error(`  missing seqs: ${outcome.missing.length}`);
    process.exit(1);
  }

  console.log(`\n✓ FILED in ${secs}s`);
  console.log(`  recordingId  : ${outcome.recordingId}`);
  console.log(`  title        : ${outcome.result.title}`);
  console.log(`  actionItems  : ${outcome.result.actionItemCount}`);
  console.log(`  contact      : ${outcome.result.contact?.name ?? "(none)"}`);
  console.log(`  suspectFlags : ${outcome.suspectFlags.join(", ") || "(none)"}`);
  console.log(`\n  brief:\n${outcome.result.brief || "(none)"}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("✗ uncaught:", e);
  process.exit(1);
});
