/**
 * Pure path builders for frozen signature documents.
 * No server-only imports — unit-testable.
 */

/** Max document size for freeze / sign (30 MB). */
export const SIGN_DOC_MAX_BYTES = 30 * 1024 * 1024;

/** Folder for all signature artifacts of one request. */
export function signatureRequestBasePath(opts: {
  workspaceId: string;
  roomId: string;
  requestId: string;
}): string {
  return `${opts.workspaceId}/partner-signatures/${opts.roomId}/${opts.requestId}`;
}

export function frozenDocumentPath(opts: {
  workspaceId: string;
  roomId: string;
  requestId: string;
  ext?: string;
}): string {
  const ext = (opts.ext ?? "bin").replace(/^\./, "").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  return `${signatureRequestBasePath(opts)}/source.${ext}`;
}

export function signatureImagePath(opts: {
  workspaceId: string;
  roomId: string;
  requestId: string;
}): string {
  return `${signatureRequestBasePath(opts)}/firma.png`;
}

export function signedPdfPath(opts: {
  workspaceId: string;
  roomId: string;
  requestId: string;
}): string {
  return `${signatureRequestBasePath(opts)}/firmado.pdf`;
}

/** Legacy paths used before the folder layout (P0). */
export function legacySignatureImagePath(opts: {
  workspaceId: string;
  roomId: string;
  requestId: string;
}): string {
  return `${opts.workspaceId}/partner-signatures/${opts.roomId}/${opts.requestId}-firma.png`;
}

export function legacySignedPdfPath(opts: {
  workspaceId: string;
  roomId: string;
  requestId: string;
}): string {
  return `${opts.workspaceId}/partner-signatures/${opts.roomId}/${opts.requestId}-firmado.pdf`;
}

export function mimeFromPdfMagic(bytes: Uint8Array): string {
  if (
    bytes.length > 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  ) {
    return "application/pdf";
  }
  return "application/octet-stream";
}

export function extForMime(mime: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) {
    const sub = mime.slice(6).split("+")[0];
    if (["png", "jpeg", "jpg", "webp", "gif"].includes(sub)) {
      return sub === "jpeg" ? "jpg" : sub;
    }
  }
  return "bin";
}
