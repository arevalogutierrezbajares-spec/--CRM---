/**
 * Validation for the drawn-signature payload coming from the public portal.
 * Pure (no server-only imports) so it's unit-testable.
 */

/** Decoded PNG cap — a signature stroke PNG is a few KB; 300 KB is generous. */
export const SIGNATURE_PNG_MAX_BYTES = 300 * 1024;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * data:image/png;base64,… → PNG bytes, or null when the payload isn't a
 * well-formed, reasonably-sized PNG. Magic-byte check stops renamed content.
 */
export function decodeSignatureDataUrl(dataUrl: string): Uint8Array | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!m) return null;
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(m[1], "base64"));
  } catch {
    return null;
  }
  if (bytes.length < PNG_MAGIC.length || bytes.length > SIGNATURE_PNG_MAX_BYTES) return null;
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (bytes[i] !== PNG_MAGIC[i]) return null;
  }
  return bytes;
}

/**
 * Audit-trail display: UTC instant plus Venezuela local time, e.g.
 * "12 jun 2026, 1:30 p.m. (Caracas) — 2026-06-12T17:30:00.000Z (UTC)".
 */
export function formatSignedAt(date: Date): { local: string; utc: string } {
  const local = new Intl.DateTimeFormat("es-VE", {
    timeZone: "America/Caracas",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return { local: `${local} (Caracas)`, utc: date.toISOString() };
}
