"use client";

/**
 * FR-DOC-13/20 (client) — orchestrates a direct browser → Supabase upload:
 *   1. ask the server action for a signed upload URL (validates type/size/perm)
 *   2. PUT the bytes straight to Supabase Storage (bypasses the Vercel limit)
 *   3. ask the server action to verify + record the metadata row
 */
import { createClient } from "@/lib/supabase/client";
import {
  createUploadUrlAction,
  finalizeFileUploadAction,
} from "@/app/(app)/lob/actions";
import { canonicalMime, isAllowedUpload, REJECT_MESSAGE } from "./allowed-types";
import { maxUploadBytes, tooLargeMessage } from "./limits";
import { PROJECT_FILES_BUCKET } from "./constants";

export type UploadOutcome =
  | { ok: true; linkId: string }
  | { ok: false; error: string };

/** Cheap pre-flight so we fail fast before any network round-trip. */
export function preValidateFile(file: File): { ok: true } | { ok: false; error: string } {
  if (!isAllowedUpload(file.name, file.type)) return { ok: false, error: REJECT_MESSAGE };
  if (file.size > maxUploadBytes()) return { ok: false, error: tooLargeMessage() };
  if (file.size <= 0) return { ok: false, error: "Empty file" };
  return { ok: true };
}

export async function uploadProjectFile(opts: {
  lobId: string;
  file: File;
  label?: string;
  category?: string;
}): Promise<UploadOutcome> {
  const pre = preValidateFile(opts.file);
  if (!pre.ok) return pre;

  const signed = await createUploadUrlAction({
    lobId: opts.lobId,
    filename: opts.file.name,
    mime: opts.file.type,
    sizeBytes: opts.file.size,
  });
  if (!signed.ok) return { ok: false, error: signed.error };

  // Content-type matters: a .html stored as text/plain (+nosniff) renders as
  // source, not a page. @supabase/storage-js sends Blob/File bodies as multipart
  // FormData, and Supabase ignores the part's content-type (stores text/plain).
  // Only the RAW-body path honors the contentType option — so upload an
  // ArrayBuffer (not a Blob) with the canonical type derived from the extension.
  const contentType = canonicalMime(opts.file.name, opts.file.type);
  const body = await opts.file.arrayBuffer();

  const supabase = createClient();
  const { error: uploadError } = await supabase.storage
    .from(PROJECT_FILES_BUCKET)
    .uploadToSignedUrl(signed.path, signed.token, body, { contentType });
  if (uploadError) {
    return { ok: false, error: uploadError.message || "Upload failed" };
  }

  const finalized = await finalizeFileUploadAction({
    lobId: opts.lobId,
    storagePath: signed.path,
    originalFilename: opts.file.name,
    mime: opts.file.type,
    sizeBytes: opts.file.size,
    label: opts.label,
    category: opts.category,
  });
  if (!finalized.ok) return { ok: false, error: finalized.error };
  return { ok: true, linkId: finalized.id };
}
