import { NextResponse } from "next/server";
import { resolvePartnerRoomByToken } from "@/db/queries/partner-access";
import { getSignatureForRequest } from "@/db/queries/partner-signatures";
import { createSignedDownloadUrl } from "@/lib/project-files/storage";
import { isPartnerRoomUnlocked } from "@/lib/partner-room-gate.server";

type Params = Promise<{ token: string; requestId: string }>;

/** Gated download of the stamped signed PDF for this room's guests. */
export async function GET(_: Request, { params }: { params: Params }) {
  const { token, requestId } = await params;
  const room = await resolvePartnerRoomByToken(token).catch(() => null);
  if (!room) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await isPartnerRoomUnlocked(room))) {
    return NextResponse.json({ error: "Room is locked" }, { status: 401 });
  }

  const signature = await getSignatureForRequest({
    roomId: room.id,
    requestId,
  }).catch(() => null);
  if (!signature?.signedPdfPath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const signed = await createSignedDownloadUrl(signature.signedPdfPath);
  if (!signed.ok) {
    return NextResponse.json({ error: "File unavailable" }, { status: 503 });
  }
  return NextResponse.redirect(signed.url);
}
