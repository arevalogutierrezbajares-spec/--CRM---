/**
 * Shared decoder for the inline-upload MCP tools (upload_room_file,
 * upload_room_logo). The agent passes file bytes as a base64 string (optionally
 * a data: URL), so uploads work end-to-end over the MCP JSON transport without a
 * signed-URL round trip. Kept small on purpose — larger files should still go
 * through the web uploader, which streams straight to storage.
 */

export type DecodedUpload = { bytes: Uint8Array; sizeBytes: number };

/**
 * Decode a base64 (or data: URL) string into bytes, enforcing a byte ceiling.
 * Whitespace/newlines the agent may wrap in are stripped before decoding.
 */
export function decodeBase64Upload(
  content: unknown,
  maxBytes: number,
): { ok: true; result: DecodedUpload } | { ok: false; error: string } {
  if (typeof content !== "string" || !content.trim()) {
    return { ok: false, error: "content_base64 is required" };
  }
  let b64 = content.trim();
  // Strip a "data:<mime>;base64," prefix if the agent passed a full data URL.
  if (b64.startsWith("data:")) {
    const comma = b64.indexOf(",");
    if (comma !== -1) b64 = b64.slice(comma + 1);
  }
  b64 = b64.replace(/\s+/g, "");
  if (!b64) return { ok: false, error: "content_base64 is empty" };

  const buf = Buffer.from(b64, "base64");
  if (buf.length === 0) {
    return { ok: false, error: "content_base64 did not decode to any bytes — is it valid base64?" };
  }
  if (buf.length > maxBytes) {
    const mb = (buf.length / (1024 * 1024)).toFixed(1);
    const capMb = (maxBytes / (1024 * 1024)).toFixed(0);
    return {
      ok: false,
      error: `File is too large for inline upload (${mb} MB; max ${capMb} MB). Upload larger files from the web app.`,
    };
  }
  return { ok: true, result: { bytes: new Uint8Array(buf), sizeBytes: buf.length } };
}
