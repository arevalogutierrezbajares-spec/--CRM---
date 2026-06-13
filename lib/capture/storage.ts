/**
 * Supabase Storage helpers for call audio (private bucket `agb-call-audio`).
 * Mirrors lib/project-files/storage.ts conventions: service-role client,
 * server-only, callers handle {ok:false} gracefully.
 */
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CALL_AUDIO_BUCKET, sessionPrefix } from "./constants";

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

let bucketEnsured = false;
/** Create the bucket on first use (idempotent; ignores "already exists"). */
async function ensureBucket(supabase: SupabaseClient): Promise<void> {
  if (bucketEnsured) return;
  const { error } = await supabase.storage.createBucket(CALL_AUDIO_BUCKET, {
    public: false,
  });
  // "Duplicate" / 409 means it already exists — fine. Anything else surfaces
  // on the subsequent operation, which reports a real error to the caller.
  if (!error || /already exists|duplicate/i.test(error.message)) {
    bucketEnsured = true;
  }
}

export async function putObject(
  path: string,
  bytes: Uint8Array,
  contentType = "audio/wav",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = serviceClient();
  if (!supabase) return { ok: false, error: "Storage not configured" };
  await ensureBucket(supabase);
  // Storage shows transient flakes ("fetch failed", spurious 400s) under
  // load; uploads are upserts, so a short in-route retry is safe and saves
  // the caller a whole round-trip (NFR-CALL-REL-1).
  let lastError = "unknown";
  for (const delayMs of [0, 500, 1500]) {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    const { error } = await supabase.storage
      .from(CALL_AUDIO_BUCKET)
      .upload(path, bytes, { contentType, upsert: true });
    if (!error) return { ok: true };
    lastError = error.message;
  }
  return { ok: false, error: lastError };
}

export async function downloadObject(
  path: string,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }> {
  const supabase = serviceClient();
  if (!supabase) return { ok: false, error: "Storage not configured" };
  const { data, error } = await supabase.storage
    .from(CALL_AUDIO_BUCKET)
    .download(path);
  if (error || !data) return { ok: false, error: error?.message ?? "missing" };
  return { ok: true, bytes: new Uint8Array(await data.arrayBuffer()) };
}

export async function removeObjects(
  paths: string[],
): Promise<{ failed: string[] }> {
  if (paths.length === 0) return { failed: [] };
  const supabase = serviceClient();
  if (!supabase) return { failed: paths };
  const failed: string[] = [];
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await supabase.storage.from(CALL_AUDIO_BUCKET).remove(batch);
    if (error) failed.push(...batch);
  }
  return { failed };
}

export type ChunkEntry = { path: string; size: number };

/**
 * List chunk objects for a session with their byte sizes, sorted by name (=seq,
 * zero-padded). Sizes let the assembler preallocate one output buffer and copy
 * chunks in one at a time, instead of holding every chunk in RAM at once
 * (NFR-CALL-REL-1 / 3h-call memory).
 */
export async function listSessionChunks(
  workspaceId: string,
  sessionId: string,
): Promise<ChunkEntry[]> {
  const supabase = serviceClient();
  if (!supabase) return [];
  const prefix = sessionPrefix(workspaceId, sessionId);
  const out: ChunkEntry[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage
      .from(CALL_AUDIO_BUCKET)
      .list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error || !data || data.length === 0) break;
    for (const entry of data) {
      if (entry.id !== null) {
        out.push({
          path: `${prefix}/${entry.name}`,
          size: (entry.metadata?.size as number | undefined) ?? 0,
        });
      }
    }
    if (data.length < 100) break;
    offset += 100;
  }
  return out;
}

/** Back-compat: paths only (abandon/reap paths that don't need sizes). */
export async function listSessionChunkPaths(
  workspaceId: string,
  sessionId: string,
): Promise<string[]> {
  return (await listSessionChunks(workspaceId, sessionId)).map((c) => c.path);
}

/** Short-lived signed URL (transcription fetch + in-app playback). */
export async function createSignedAudioUrl(
  path: string,
  ttlSecs = 60 * 60,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = serviceClient();
  if (!supabase) return { ok: false, error: "Storage not configured" };
  const { data, error } = await supabase.storage
    .from(CALL_AUDIO_BUCKET)
    .createSignedUrl(path, ttlSecs);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "missing" };
  }
  return { ok: true, url: data.signedUrl };
}
