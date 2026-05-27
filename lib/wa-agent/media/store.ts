import { createClient } from "@supabase/supabase-js";

export type StoreResult =
  | { ok: true; path: string; signedUrl: string; bucket: string }
  | { ok: false; error: string };

const BUCKET = "agb-media";
const SIGNED_URL_EXPIRY_SECS = 7 * 24 * 3600; // 7 days

/**
 * Upload a media buffer to Supabase Storage (private bucket `agb-media`).
 * Path pattern: {workspaceId}/{year-month}/{timestamp}-{filename}
 * Returns a 7-day signed URL for agent use.
 */
export async function storeMedia(opts: {
  workspaceId: string;
  buffer: Buffer;
  mimeType: string;
  originalFilename: string;
}): Promise<StoreResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return { ok: false, error: "Supabase storage not configured (missing SERVICE_ROLE_KEY)" };
  }

  try {
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const ts = now.getTime();
    const safeName = opts.originalFilename.replace(/[^a-z0-9._-]/gi, "_");
    const path = `${opts.workspaceId}/${yearMonth}/${ts}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, opts.buffer, {
        contentType: opts.mimeType,
        upsert: false,
      });

    if (uploadError) return { ok: false, error: uploadError.message };

    const { data: urlData, error: urlError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_EXPIRY_SECS);

    if (urlError || !urlData?.signedUrl) {
      return { ok: false, error: urlError?.message ?? "Failed to create signed URL" };
    }

    return { ok: true, path, signedUrl: urlData.signedUrl, bucket: BUCKET };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
