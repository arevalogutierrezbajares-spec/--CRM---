/**
 * Distribution of the macOS Capture Helper to workspace members. The signed
 * .app is zipped and uploaded to a private Supabase bucket; the CRM serves it
 * to authenticated cofounders via a short-lived signed URL. A small JSON
 * manifest records the current version + object path.
 */
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const DOWNLOADS_BUCKET = "agb-downloads";
export const HELPER_MANIFEST_PATH = "macos-helper/latest.json";

export type HelperRelease = {
  version: string;
  objectPath: string; // path within DOWNLOADS_BUCKET to the .zip
  bytes: number;
  sha256: string;
  publishedAt: string; // ISO
  notes?: string;
};

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Read the current published Helper release manifest, or null if none. */
export async function getLatestHelperRelease(): Promise<HelperRelease | null> {
  const supabase = serviceClient();
  if (!supabase) return null;
  const { data, error } = await supabase.storage
    .from(DOWNLOADS_BUCKET)
    .download(HELPER_MANIFEST_PATH);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text()) as HelperRelease;
  } catch {
    return null;
  }
}

/** Short-lived signed URL to the current Helper .zip, or null if unpublished. */
export async function getHelperDownloadUrl(
  ttlSecs = 300,
): Promise<{ url: string; release: HelperRelease } | null> {
  const supabase = serviceClient();
  if (!supabase) return null;
  const release = await getLatestHelperRelease();
  if (!release) return null;
  const { data, error } = await supabase.storage
    .from(DOWNLOADS_BUCKET)
    .createSignedUrl(release.objectPath, ttlSecs, {
      download: "AGB-AI.zip",
    });
  if (error || !data?.signedUrl) return null;
  return { url: data.signedUrl, release };
}
