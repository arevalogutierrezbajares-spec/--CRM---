/**
 * FR-DOC-16 — per-file size cap. Configurable via env, defaults to 25 MB.
 * Mirrored on the Supabase bucket's `file_size_limit` so the cap is enforced
 * even if the client check is bypassed.
 */

export const DEFAULT_MAX_BYTES = 26_214_400; // 25 MiB

export function maxUploadBytes(): number {
  const raw = process.env.PROJECT_FILES_MAX_BYTES;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_BYTES;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

export function tooLargeMessage(): string {
  const mb = Math.round(maxUploadBytes() / (1024 * 1024));
  return `File too large (max ${mb} MB)`;
}
