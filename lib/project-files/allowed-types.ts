/**
 * FR-DOC-15 — single source of truth for the upload allow-list.
 * Used by the client (file picker `accept` + pre-upload validation), the
 * server action (re-validation before issuing a signed upload URL), and the
 * magic-byte sniffer (lib/project-files/sniff.ts).
 */

export type AllowedType = {
  ext: string;
  /** Acceptable declared MIME types for this extension. First is canonical. */
  mimes: string[];
  /** Human label for the file-type chip (FR-DOC-17). */
  chip: string;
};

export const ALLOWED_TYPES: AllowedType[] = [
  { ext: ".pdf", mimes: ["application/pdf"], chip: "PDF" },
  { ext: ".html", mimes: ["text/html"], chip: "HTML" },
  { ext: ".htm", mimes: ["text/html"], chip: "HTML" },
  {
    ext: ".docx",
    mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    chip: "DOCX",
  },
  {
    ext: ".xlsx",
    mimes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    chip: "XLSX",
  },
  {
    ext: ".pptx",
    mimes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    chip: "PPTX",
  },
  { ext: ".png", mimes: ["image/png"], chip: "PNG" },
  { ext: ".jpg", mimes: ["image/jpeg"], chip: "JPG" },
  { ext: ".jpeg", mimes: ["image/jpeg"], chip: "JPG" },
  { ext: ".webp", mimes: ["image/webp"], chip: "WEBP" },
  { ext: ".gif", mimes: ["image/gif"], chip: "GIF" },
  { ext: ".txt", mimes: ["text/plain"], chip: "TXT" },
  { ext: ".md", mimes: ["text/markdown", "text/plain"], chip: "MD" },
  { ext: ".csv", mimes: ["text/csv", "text/plain"], chip: "CSV" },
];

/** `accept` attribute value for <input type="file"> */
export const ACCEPT_ATTR = ALLOWED_TYPES.map((t) => t.ext)
  .concat(ALLOWED_TYPES.flatMap((t) => t.mimes))
  .join(",");

export const REJECT_MESSAGE =
  "File type not allowed. Allowed: HTML decks, PDF, Office docs, images, text.";

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i).toLowerCase();
}

/**
 * Validate a (filename, declared MIME) pair against the allow-list.
 * Extension must be listed AND the declared MIME must be one of the accepted
 * MIMEs for that extension (browsers sometimes send "" for csv/md — we permit
 * an empty declared MIME and rely on extension + server-side sniff).
 */
export function isAllowedUpload(filename: string, mime: string): boolean {
  const ext = extOf(filename);
  const entry = ALLOWED_TYPES.find((t) => t.ext === ext);
  if (!entry) return false;
  if (!mime) return true; // empty declared MIME — extension matched, sniff decides
  return entry.mimes.includes(mime);
}

/** Canonical MIME to store for a filename (ignores a possibly-wrong declared MIME). */
export function canonicalMime(filename: string, declared: string): string {
  const ext = extOf(filename);
  const entry = ALLOWED_TYPES.find((t) => t.ext === ext);
  if (!entry) return declared || "application/octet-stream";
  if (declared && entry.mimes.includes(declared)) return declared;
  return entry.mimes[0];
}

/**
 * How a file can be previewed in-app (FR-DOC viewer).
 *  - "pdf"    → native browser render in an <iframe>
 *  - "html"   → HTML deck rendered in a sandboxed <iframe>
 *  - "image"  → <img>
 *  - "text"   → text/plain|md|csv render natively in an <iframe>
 *  - "office" → docx/xlsx/pptx via the Microsoft Office web viewer
 *  - "none"   → no inline preview; download only
 */
export type PreviewKind =
  | "pdf"
  | "html"
  | "image"
  | "text"
  | "markdown"
  | "office"
  | "none";

const PREVIEW_BY_EXT: Record<string, PreviewKind> = {
  ".pdf": "pdf",
  ".html": "html",
  ".htm": "html",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
  ".gif": "image",
  ".txt": "text",
  ".md": "markdown",
  ".csv": "text",
  ".docx": "office",
  ".xlsx": "office",
  ".pptx": "office",
};

export function previewKind(filename: string): PreviewKind {
  return PREVIEW_BY_EXT[extOf(filename)] ?? "none";
}

/** File-type chip label from a stored MIME / filename. */
export function chipForFile(filename: string, mime: string): string {
  const ext = extOf(filename);
  const byExt = ALLOWED_TYPES.find((t) => t.ext === ext);
  if (byExt) return byExt.chip;
  const byMime = ALLOWED_TYPES.find((t) => t.mimes.includes(mime));
  return byMime?.chip ?? "FILE";
}
