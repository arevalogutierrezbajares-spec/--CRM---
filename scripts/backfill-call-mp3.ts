#!/usr/bin/env tsx
/**
 * Backfill a compact playback MP3 for a call recording that filed without
 * stored audio (e.g. a long call rescued before MP3 playback existed). Encodes
 * the local helper chunk WAVs (canonical 44-byte header each) to mono MP3,
 * uploads it, and patches the recording row so it plays in-app.
 *
 *   env -u DATABASE_URL npx tsx scripts/backfill-call-mp3.ts <recordingId> <chunksDir>
 *
 * NOTE: encodes via a DYNAMIC import of @breezystack/lamejs — its CJS build is
 * an unusable IIFE, so tsx must resolve the ESM `import` condition at runtime
 * (the app/vitest get this for free; a static import under tsx would break).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { putObject } from "@/lib/capture/storage";
import {
  assembledMp3ObjectPath,
  WAV_HEADER_BYTES,
  CAPTURE_SAMPLE_RATE,
} from "@/lib/capture/constants";
import { getWorkspaceRetentionDays } from "@/db/queries/capture-sessions";

const { callRecordings } = schema;
const BITRATE_KBPS = 32;

async function main() {
  const recordingId = process.argv[2];
  const chunksDir = process.argv[3];
  if (!recordingId || !chunksDir) {
    console.error("usage: backfill-call-mp3.ts <recordingId> <chunksDir>");
    process.exit(1);
  }

  const [rec] = await db
    .select()
    .from(callRecordings)
    .where(eq(callRecordings.id, recordingId))
    .limit(1);
  if (!rec) {
    console.error(`✗ recording ${recordingId} not found`);
    process.exit(1);
  }
  console.log(`recording ${rec.id} "${rec.title}" — current audioPath: ${rec.audioPath ?? "(none)"}`);

  const files = readdirSync(chunksDir)
    .filter((f) => /^chunk-\d+\.wav$/.test(f))
    .sort();
  if (files.length === 0) {
    console.error(`✗ no chunk-*.wav files in ${chunksDir}`);
    process.exit(1);
  }
  console.log(`encoding ${files.length} chunks → mono MP3…`);

  const lamejsMod = await import("@breezystack/lamejs");
  const lamejs = (lamejsMod as { default?: unknown }).default ?? lamejsMod;
  const Mp3Encoder = (lamejs as { Mp3Encoder: new (c: number, sr: number, kbps: number) => { encodeBuffer(b: Int16Array): Uint8Array; flush(): Uint8Array } }).Mp3Encoder;
  const enc = new Mp3Encoder(1, CAPTURE_SAMPLE_RATE, BITRATE_KBPS);

  const parts: Uint8Array[] = [];
  for (const f of files) {
    const bytes = new Uint8Array(readFileSync(join(chunksDir, f)));
    const pcm = bytes.subarray(WAV_HEADER_BYTES);
    const view = new Int16Array(pcm.slice().buffer); // copy → aligned
    const frames = view.length >> 1;
    const mono = new Int16Array(frames);
    for (let i = 0; i < frames; i++) mono[i] = (view[i * 2] + view[i * 2 + 1]) >> 1;
    const out = enc.encodeBuffer(mono);
    if (out.length) parts.push(out);
  }
  const tail = enc.flush();
  if (tail.length) parts.push(tail);
  const total = parts.reduce((n, p) => n + p.length, 0);
  const mp3 = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { mp3.set(p, off); off += p.length; }
  console.log(`MP3: ${(mp3.length / 1048576).toFixed(1)} MB`);

  const audioPath = assembledMp3ObjectPath(rec.workspaceId, rec.id);
  const stored = await putObject(audioPath, mp3, "audio/mpeg");
  if (!stored.ok) {
    console.error(`✗ upload failed: ${stored.error}`);
    process.exit(1);
  }
  console.log(`uploaded → ${audioPath}`);

  const retentionDays = await getWorkspaceRetentionDays(rec.workspaceId);
  await db
    .update(callRecordings)
    .set({
      audioPath,
      audioBytes: mp3.length,
      audioPurgeAt: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000),
      audioPurgedAt: null,
    })
    .where(eq(callRecordings.id, rec.id));

  console.log(`✓ patched recording — audio plays in-app now (purges in ${retentionDays}d)`);
  process.exit(0);
}

main().catch((e) => {
  console.error("✗ uncaught:", e);
  process.exit(1);
});
