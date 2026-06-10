/**
 * FR-DOC-15 — server-side magic-byte sniff. Confirms the binary content
 * matches the claimed extension, defeating "rename installer.exe to logo.png"
 * style attacks. Only needs the first ~16 bytes (fetched via a Range request
 * so we never pull the whole object into the function — see storage.ts).
 *
 * No `file-type` dependency: we hand-roll signatures for exactly the
 * allow-listed families (lib/project-files/allowed-types.ts).
 */

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

const SIG = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpeg: [0xff, 0xd8, 0xff],
  gif: [0x47, 0x49, 0x46, 0x38], // GIF8
  riff: [0x52, 0x49, 0x46, 0x46], // RIFF
  webp: [0x57, 0x45, 0x42, 0x50], // WEBP (at offset 8)
  zip: [0x50, 0x4b, 0x03, 0x04], // PK\x03\x04 (docx/xlsx/pptx)
  zipEmpty: [0x50, 0x4b, 0x05, 0x06],
  ole: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], // legacy .doc/.xls/.ppt
  // Executable signatures we explicitly reject even for text extensions.
  mz: [0x4d, 0x5a], // PE / DOS
  elf: [0x7f, 0x45, 0x4c, 0x46],
  machO32: [0xfe, 0xed, 0xfa, 0xce],
  machO64: [0xfe, 0xed, 0xfa, 0xcf],
  machOuniv: [0xca, 0xfe, 0xba, 0xbe],
};

function isExecutable(b: Uint8Array): boolean {
  return (
    startsWith(b, SIG.mz) ||
    startsWith(b, SIG.elf) ||
    startsWith(b, SIG.machO32) ||
    startsWith(b, SIG.machO64) ||
    startsWith(b, SIG.machOuniv)
  );
}

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i).toLowerCase();
}

export type SniffResult = { ok: true } | { ok: false; reason: string };

/**
 * Validate that `bytes` (first 16+ bytes of the uploaded object) are consistent
 * with `filename`'s extension.
 */
export function sniffConsistent(filename: string, bytes: Uint8Array): SniffResult {
  const ext = extOf(filename);
  const mismatch: SniffResult = {
    ok: false,
    reason: "File content does not match its extension.",
  };

  switch (ext) {
    case ".pdf":
      return startsWith(bytes, SIG.pdf) ? { ok: true } : mismatch;
    case ".png":
      return startsWith(bytes, SIG.png) ? { ok: true } : mismatch;
    case ".jpg":
    case ".jpeg":
      return startsWith(bytes, SIG.jpeg) ? { ok: true } : mismatch;
    case ".gif":
      return startsWith(bytes, SIG.gif) ? { ok: true } : mismatch;
    case ".webp":
      return startsWith(bytes, SIG.riff) && startsWith(bytes, SIG.webp, 8)
        ? { ok: true }
        : mismatch;
    case ".docx":
    case ".xlsx":
    case ".pptx":
      return startsWith(bytes, SIG.zip) || startsWith(bytes, SIG.zipEmpty)
        ? { ok: true }
        : mismatch;
    case ".txt":
    case ".md":
    case ".csv":
    case ".html":
    case ".htm":
      // Text/markup files have no signature; only reject clear executables.
      return isExecutable(bytes)
        ? { ok: false, reason: "Executable content rejected." }
        : { ok: true };
    default:
      return { ok: false, reason: "Unsupported file type." };
  }
}

/** True when the head bytes carry a known executable signature. */
export function isExecutableContent(bytes: Uint8Array): boolean {
  return isExecutable(bytes);
}

/**
 * Allow-list for the PUBLIC partner-room upload (guests sending docs back to
 * the operator). Wider than the FR-DOC list — clients send legacy Office files
 * and zips — but every family still gets a magic-byte check server-side.
 */
export const PARTNER_UPLOAD_EXTS = [
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".txt", ".csv", ".png", ".jpg", ".jpeg", ".zip",
] as const;

export function isAllowedPartnerUpload(filename: string): boolean {
  return (PARTNER_UPLOAD_EXTS as readonly string[]).includes(extOf(filename));
}

/** Magic-byte validation for the partner-upload allow-list. */
export function sniffPartnerUpload(filename: string, bytes: Uint8Array): SniffResult {
  const ext = extOf(filename);
  const mismatch: SniffResult = {
    ok: false,
    reason: "File content does not match its extension.",
  };
  switch (ext) {
    case ".pdf":
    case ".png":
    case ".jpg":
    case ".jpeg":
    case ".docx":
    case ".xlsx":
    case ".pptx":
      return sniffConsistent(filename, bytes);
    case ".doc":
    case ".xls":
    case ".ppt":
      // Legacy Office = OLE compound file; some old exports are actually zips.
      return startsWith(bytes, SIG.ole) || startsWith(bytes, SIG.zip)
        ? { ok: true }
        : mismatch;
    case ".zip":
      return startsWith(bytes, SIG.zip) || startsWith(bytes, SIG.zipEmpty)
        ? { ok: true }
        : mismatch;
    case ".txt":
    case ".csv":
      return isExecutable(bytes)
        ? { ok: false, reason: "Executable content rejected." }
        : { ok: true };
    default:
      return { ok: false, reason: "Unsupported file type." };
  }
}
