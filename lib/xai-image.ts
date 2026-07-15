/**
 * xAI (Grok) image generation — thin fetch client, same shape as
 * lib/anthropic.ts. Activates on XAI_API_KEY; callers must handle the
 * disabled case (rooms fall back to the video/aurora hero).
 *
 * POST https://api.x.ai/v1/images/generations
 * Models: grok-imagine-image (fast) | grok-imagine-image-quality (hi-fi).
 */
import "server-only";

const XAI_IMAGES_URL = "https://api.x.ai/v1/images/generations";
const DEFAULT_MODEL = "grok-imagine-image";
const GENERATION_TIMEOUT_MS = 90_000;

export type XaiImageResult =
  | { ok: true; bytes: Uint8Array; mime: string; model: string }
  | { ok: false; error: string };

export function xaiImageEnabled(): boolean {
  return Boolean(process.env.XAI_API_KEY);
}

/** PNG / JPEG / WEBP magic bytes → mime; the API doesn't declare the format. */
function sniffMime(bytes: Uint8Array): string {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (
    bytes.length > 12 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return "image/jpeg";
}

export async function generateXaiImage(opts: {
  prompt: string;
  /** e.g. "2:1" for a room hero banner (also crops well to 1.91:1 OG). */
  aspectRatio?: string;
  resolution?: "1k" | "2k";
}): Promise<XaiImageResult> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false, error: "XAI_API_KEY is not configured" };
  const model = process.env.XAI_IMAGE_MODEL || DEFAULT_MODEL;

  let res: Response;
  try {
    res = await fetch(XAI_IMAGES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: opts.prompt,
        n: 1,
        response_format: "b64_json",
        aspect_ratio: opts.aspectRatio ?? "2:1",
        resolution: opts.resolution ?? "2k",
      }),
      signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return { ok: false, error: timedOut ? "Image generation timed out" : "Could not reach xAI" };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      error: `xAI error ${res.status}: ${body.slice(0, 300) || res.statusText}`,
    };
  }

  let payload: { data?: Array<{ b64_json?: string; url?: string }> };
  try {
    payload = await res.json();
  } catch {
    return { ok: false, error: "xAI returned a non-JSON response" };
  }

  const first = payload.data?.[0];
  if (first?.b64_json) {
    const bytes = new Uint8Array(Buffer.from(first.b64_json, "base64"));
    if (bytes.length === 0) return { ok: false, error: "xAI returned an empty image" };
    return { ok: true, bytes, mime: sniffMime(bytes), model };
  }

  // Defensive: some gateways ignore response_format and return a URL.
  if (first?.url) {
    try {
      const img = await fetch(first.url, { signal: AbortSignal.timeout(30_000) });
      if (!img.ok) return { ok: false, error: `Image download failed (${img.status})` };
      const bytes = new Uint8Array(await img.arrayBuffer());
      return { ok: true, bytes, mime: sniffMime(bytes), model };
    } catch {
      return { ok: false, error: "Image download failed" };
    }
  }

  return { ok: false, error: "xAI response had no image data" };
}
