/**
 * Download media from WhatsApp Cloud API.
 *
 * Two-step: first GET /{media-id} to get the download URL,
 * then GET the URL with the Bearer token to fetch binary data.
 */

const GRAPH_VERSION = "v19.0";

export type DownloadResult =
  | { ok: true; buffer: Buffer; mimeType: string; filename: string }
  | { ok: false; error: string };

export async function downloadWaMedia(mediaId: string): Promise<DownloadResult> {
  const token = process.env.WA_ACCESS_TOKEN;
  if (!token) return { ok: false, error: "WA_ACCESS_TOKEN not configured" };

  // Step 1: resolve media URL
  const metaResp = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!metaResp.ok) {
    return { ok: false, error: `Media meta fetch failed: ${metaResp.status}` };
  }
  const meta = (await metaResp.json()) as {
    url?: string;
    mime_type?: string;
    file_size?: number;
    sha256?: string;
    id?: string;
  };
  if (!meta.url) return { ok: false, error: "No URL in media metadata" };

  // Step 2: download binary
  const fileResp = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!fileResp.ok) {
    return { ok: false, error: `Media download failed: ${fileResp.status}` };
  }

  const arrayBuffer = await fileResp.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = meta.mime_type ?? fileResp.headers.get("content-type") ?? "application/octet-stream";

  // Derive a filename from mime type
  const extMap: Record<string, string> = {
    "audio/ogg": "voice.ogg",
    "audio/mpeg": "audio.mp3",
    "image/jpeg": "image.jpg",
    "image/png": "image.png",
    "image/webp": "image.webp",
    "video/mp4": "video.mp4",
    "application/pdf": "document.pdf",
  };
  const filename = extMap[mimeType] ?? `media-${mediaId}`;

  return { ok: true, buffer, mimeType, filename };
}
