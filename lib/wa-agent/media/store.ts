/**
 * Media storage via Supabase Storage.
 *
 * Uploads WhatsApp media (images, documents, audio) to a private bucket.
 * Returns a signed URL valid for 7 days.
 *
 * Requires: SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL env vars.
 * Bucket name: AGB_MEDIA_BUCKET (default: "agb-media").
 */

import { createClient } from "@supabase/supabase-js";

export type StoreResult =
  | { ok: true; path: string; signedUrl: string; mimeType: string; sizeBytes: number }
  | { ok: false; error: string };

function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function getBucket(): string {
  return process.env.AGB_MEDIA_BUCKET ?? "agb-media";
}

export function isStorageConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export async function storeMedia(opts: {
  workspaceId: string;
  buffer: Buffer;
  mimeType: string;
  originalFilename: string;
}): Promise<StoreResult> {
  const client = getStorageClient();
  if (!client) return { ok: false, error: "Supabase storage not configured" };

  const bucket = getBucket();
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const timestamp = now.getTime();
  const safeName = opts.originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${opts.workspaceId}/${yearMonth}/${timestamp}-${safeName}`;

  const { error } = await client.storage
    .from(bucket)
    .upload(path, opts.buffer, { contentType: opts.mimeType, upsert: false });

  if (error) return { ok: false, error: error.message };

  // Generate signed URL (7 days)
  const { data: signedData, error: signError } = await client.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  if (signError || !signedData?.signedUrl) {
    return { ok: false, error: signError?.message ?? "Could not create signed URL" };
  }

  return {
    ok: true,
    path,
    signedUrl: signedData.signedUrl,
    mimeType: opts.mimeType,
    sizeBytes: opts.buffer.byteLength,
  };
}
