/**
 * Validation for the drawn-signature payload coming from the public portal.
 * No server-only imports so it's unit-testable.
 *
 * The structural walk below is load-bearing, not pedantry: pdf-lib's
 * embedPng() spins in an INFINITE LOOP on malformed PNG bodies that pass a
 * magic-byte check, which would pin the signing endpoint's CPU until the
 * function timeout. Nothing reaches pdf-lib unless it's a fully well-formed,
 * bounded, non-interlaced PNG whose pixel data actually inflates.
 */
import { inflateSync } from "node:zlib";

/** Decoded PNG cap — a signature stroke PNG is a few KB; 300 KB is generous. */
export const SIGNATURE_PNG_MAX_BYTES = 300 * 1024;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_MAX_DIM = 4096; // pad canvas tops out ~2300px at 3x DPR
const PNG_MAX_RAW_BYTES = 64 * 1024 * 1024;

function readU32(bytes: Uint8Array, off: number): number {
  return (
    ((bytes[off] << 24) |
      (bytes[off + 1] << 16) |
      (bytes[off + 2] << 8) |
      bytes[off + 3]) >>>
    0
  );
}

function isWellFormedPng(bytes: Uint8Array): boolean {
  let off = PNG_MAGIC.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let sawIhdr = false;
  let sawIend = false;
  const idatParts: Buffer[] = [];
  let chunks = 0;
  while (off + 8 <= bytes.length) {
    if (++chunks > 1000) return false;
    const len = readU32(bytes, off);
    const type = String.fromCharCode(
      bytes[off + 4],
      bytes[off + 5],
      bytes[off + 6],
      bytes[off + 7],
    );
    const dataStart = off + 8;
    const dataEnd = dataStart + len;
    if (len > bytes.length || dataEnd + 4 > bytes.length) return false;
    if (!sawIhdr) {
      if (type !== "IHDR" || len !== 13) return false;
      width = readU32(bytes, dataStart);
      height = readU32(bytes, dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      const compression = bytes[dataStart + 10];
      const filter = bytes[dataStart + 11];
      const interlace = bytes[dataStart + 12];
      if (width < 1 || height < 1 || width > PNG_MAX_DIM || height > PNG_MAX_DIM)
        return false;
      if (![1, 2, 4, 8, 16].includes(bitDepth)) return false;
      if (![0, 2, 3, 4, 6].includes(colorType)) return false;
      // Canvas toDataURL never emits interlaced PNGs.
      if (compression !== 0 || filter !== 0 || interlace !== 0) return false;
      sawIhdr = true;
    } else if (type === "IDAT") {
      idatParts.push(Buffer.from(bytes.subarray(dataStart, dataEnd)));
    } else if (type === "IEND") {
      // IEND must be empty and final — no trailing junk.
      if (len !== 0 || dataEnd + 4 !== bytes.length) return false;
      sawIend = true;
      break;
    }
    off = dataEnd + 4; // length + type + data + CRC
  }
  if (!sawIhdr || !sawIend || idatParts.length === 0) return false;

  const channels =
    colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4;
  const bytesPerRow = 1 + Math.ceil((width * channels * bitDepth) / 8);
  const expected = bytesPerRow * height;
  if (expected > PNG_MAX_RAW_BYTES) return false;
  try {
    const raw = inflateSync(Buffer.concat(idatParts), { maxOutputLength: expected });
    return raw.length === expected;
  } catch {
    return false;
  }
}

/**
 * data:image/png;base64,… → PNG bytes, or null when the payload isn't a
 * well-formed, reasonably-sized PNG (see isWellFormedPng for why "well-formed"
 * must mean a full structural validation here).
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
  if (!isWellFormedPng(bytes)) return null;
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
