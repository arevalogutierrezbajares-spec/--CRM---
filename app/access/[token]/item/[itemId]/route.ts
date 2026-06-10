import { NextResponse } from "next/server";
import { resolvePartnerRoomByToken } from "@/db/queries/partner-access";
import { getRoomItem } from "@/db/queries/partner-repository";
import { isPartnerRoomUnlocked } from "@/lib/partner-room-gate.server";
import { createSignedDownloadUrl } from "@/lib/project-files/storage";
import { canonicalMime } from "@/lib/project-files/allowed-types";

type Params = Promise<{ token: string; itemId: string }>;

/**
 * Serve a room-repository file to a signed-in guest: images/video/PDF render
 * inline (CSP-sandboxed), everything else streams with its real content-type.
 */
export async function GET(req: Request, { params }: { params: Params }) {
  const { token, itemId } = await params;
  const room = await resolvePartnerRoomByToken(token).catch(() => null);
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isPartnerRoomUnlocked(room))) {
    return NextResponse.redirect(new URL(`/access/${token}`, req.url));
  }

  const item = await getRoomItem({ roomId: room.id, itemId }).catch(() => null);
  if (!item || item.kind !== "file" || !item.storagePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const signed = await createSignedDownloadUrl(item.storagePath);
  if (!signed.ok) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const upstream = await fetch(signed.url);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  }

  const contentType = item.mimeType || canonicalMime(item.storagePath, "application/octet-stream");
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox allow-scripts allow-popups allow-forms",
    },
  });
}
