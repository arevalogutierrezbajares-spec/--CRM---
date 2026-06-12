/**
 * FR-DOC-14/18/19 — Supabase Storage helpers for project files.
 * Single private bucket `agb-project-files`, path-namespaced by workspace +
 * project. Uses the service-role client (server-only).
 */
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PROJECT_FILES_BUCKET, SIGNED_DOWNLOAD_TTL_SECS } from "./constants";

export { PROJECT_FILES_BUCKET, SIGNED_DOWNLOAD_TTL_SECS };

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** slug(original_filename) for the storage path — keeps the extension. */
export function slugFilename(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = (dot === -1 ? name : name.slice(0, dot))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "file";
  const ext = (dot === -1 ? "" : name.slice(dot)).toLowerCase().replace(/[^a-z0-9.]/g, "");
  return `${base}${ext}`;
}

/** {workspace_id}/{lob_id}/{uuid}-{slug(original_filename)} */
export function buildStoragePath(opts: {
  workspaceId: string;
  lobId: string;
  originalFilename: string;
}): string {
  const unique = crypto.randomUUID();
  return `${opts.workspaceId}/${opts.lobId}/${unique}-${slugFilename(opts.originalFilename)}`;
}

export type SignedUpload = { path: string; token: string; signedUrl: string };

/** FR-DOC-13/16 — issue a direct-upload URL (browser → Supabase, bypasses Vercel). */
export async function createSignedUploadUrl(
  path: string,
): Promise<{ ok: true; data: SignedUpload } | { ok: false; error: string }> {
  const supabase = serviceClient();
  if (!supabase) return { ok: false, error: "Storage not configured" };
  const { data, error } = await supabase.storage
    .from(PROJECT_FILES_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to sign upload" };
  return { ok: true, data: { path: data.path, token: data.token, signedUrl: data.signedUrl } };
}

/** Server-side direct upload of in-memory bytes (signature PNGs, stamped PDFs). */
export async function uploadBytes(
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = serviceClient();
  if (!supabase) return { ok: false, error: "Storage not configured" };
  const { error } = await supabase.storage
    .from(PROJECT_FILES_BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** FR-DOC-18 — short-lived download URL, generated on click (not page load). */
export async function createSignedDownloadUrl(
  path: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = serviceClient();
  if (!supabase) return { ok: false, error: "Storage not configured" };
  const { data, error } = await supabase.storage
    .from(PROJECT_FILES_BUCKET)
    .createSignedUrl(path, SIGNED_DOWNLOAD_TTL_SECS);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "missing" };
  }
  return { ok: true, url: data.signedUrl };
}

/** Does the object exist? Used to surface "file missing" (FR-DOC-18). */
export async function objectExists(path: string): Promise<boolean> {
  const supabase = serviceClient();
  if (!supabase) return false;
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash);
  const name = slash === -1 ? path : path.slice(slash + 1);
  const { data } = await supabase.storage
    .from(PROJECT_FILES_BUCKET)
    .list(dir, { search: name, limit: 1 });
  return Boolean(data && data.some((o) => o.name === name));
}

/**
 * FR-DOC-15 — fetch only the first `n` bytes of the uploaded object via a
 * Range request against a signed URL, so the function never holds the whole
 * (up to 25 MB) blob. Returns null if the object can't be read.
 */
export async function sniffHeadBytes(path: string, n = 16): Promise<Uint8Array | null> {
  const signed = await createSignedDownloadUrl(path);
  if (!signed.ok) return null;
  try {
    const res = await fetch(signed.url, { headers: { Range: `bytes=0-${n - 1}` } });
    if (!res.ok && res.status !== 206) return null;
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

/** FR-DOC-19/22 — remove objects. Returns the paths that failed to delete. */
export async function removeObjects(paths: string[]): Promise<{ failed: string[] }> {
  const supabase = serviceClient();
  if (!supabase) return { failed: paths };
  if (paths.length === 0) return { failed: [] };
  const { error } = await supabase.storage.from(PROJECT_FILES_BUCKET).remove(paths);
  return { failed: error ? paths : [] };
}

/**
 * FR-DOC-22 — purge every object under a workspace's prefix, in batches of 100.
 * Returns any paths that failed to delete (orphans for the reaper). Intended to
 * be called by a future admin `deleteWorkspace` action BEFORE the DB cascade.
 */
export async function purgeWorkspaceStorage(
  workspaceId: string,
): Promise<{ removed: number; failed: string[] }> {
  const paths = await listAllUnder(`${workspaceId}/`);
  let removed = 0;
  const failed: string[] = [];
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const res = await removeObjects(batch);
    if (res.failed.length > 0) failed.push(...res.failed);
    else removed += batch.length;
  }
  return { removed, failed };
}

/**
 * Set of storage paths that actually exist under a project's prefix, for
 * flagging file rows whose object was lost (deleted out-of-band, reaped, etc).
 * One list call covers the whole project. Returns `null` when storage is
 * unconfigured — callers should treat that as "unknown, assume attached"
 * rather than greying out every file.
 */
export async function listAttachedPaths(
  workspaceId: string,
  projectId: string,
): Promise<Set<string> | null> {
  if (!serviceClient()) return null;
  const paths = await listAllUnder(`${workspaceId}/${projectId}`);
  return new Set(paths);
}

/** FR-DOC-22 — list all object paths under a prefix (paginated). */
export async function listAllUnder(prefix: string): Promise<string[]> {
  const supabase = serviceClient();
  if (!supabase) return [];
  const out: string[] = [];
  const walk = async (dir: string) => {
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage
        .from(PROJECT_FILES_BUCKET)
        .list(dir, { limit: 100, offset });
      if (error || !data || data.length === 0) break;
      for (const entry of data) {
        const full = dir ? `${dir}/${entry.name}` : entry.name;
        // Folders have a null id in Supabase Storage listings.
        if (entry.id === null) await walk(full);
        else out.push(full);
      }
      if (data.length < 100) break;
      offset += 100;
    }
  };
  await walk(prefix.replace(/\/+$/, ""));
  return out;
}
