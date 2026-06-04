/**
 * FR-DOC-1 + NFR-DOC-SEC-3 — URL validation.
 * Well-formedness + scheme check only. No HEAD-ping (FR-DOC Open Q3).
 * Reject `javascript:`, `data:`, `file:` to prevent obvious XSS / leak vectors.
 */

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

export type UrlValidationResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export function validateLinkUrl(input: string): UrlValidationResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "URL is required" };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error: "Enter a valid URL starting with https://",
    };
  }
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return {
      ok: false,
      error: "Only http:// and https:// URLs are allowed",
    };
  }
  // Normalise: lowercase host, drop default ports
  return { ok: true, url: parsed.toString() };
}
