export type DownloadResult =
  | { ok: true; buffer: Buffer; mimeType: string; filename: string }
  | { ok: false; error: string };

/**
 * Download a WhatsApp media item using the two-step Graph API flow:
 *   1. GET /v19.0/{media-id} → retrieves the download URL
 *   2. GET {url} → downloads the binary
 */
export async function downloadWaMedia(mediaId: string): Promise<DownloadResult> {
  // Accept either name — the rest of the app configures WA_ACCESS_TOKEN.
  const token = process.env.WHATSAPP_TOKEN || process.env.WA_ACCESS_TOKEN;
  if (!token)
    return { ok: false, error: "WA_ACCESS_TOKEN (or WHATSAPP_TOKEN) not configured" };

  try {
    // Step 1 — get the download URL
    const metaRes = await fetch(
      `https://graph.facebook.com/v19.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!metaRes.ok) {
      return { ok: false, error: `Media metadata fetch failed: ${metaRes.status}` };
    }
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string; sha256?: string; file_size?: number };
    if (!meta.url) return { ok: false, error: "No URL in media metadata response" };

    const mimeType = meta.mime_type ?? "application/octet-stream";

    // Step 2 — download the binary
    const binRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!binRes.ok) {
      return { ok: false, error: `Media download failed: ${binRes.status}` };
    }

    const arrayBuffer = await binRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Derive a filename from mime type
    const ext = mimeType.split("/")[1]?.split(";")[0] ?? "bin";
    const filename = `${mediaId}.${ext}`;

    return { ok: true, buffer, mimeType, filename };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
