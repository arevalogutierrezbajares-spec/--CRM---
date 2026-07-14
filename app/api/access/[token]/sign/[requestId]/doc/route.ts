import { NextRequest, NextResponse } from "next/server";
import { resolvePartnerRoomByToken } from "@/db/queries/partner-access";
import { getSignatureRequest } from "@/db/queries/partner-signatures";
import { isPartnerRoomUnlocked } from "@/lib/partner-room-gate.server";
import { getRoomDict } from "@/lib/partner-room-i18n";
import {
  fetchSignatureTargetBytes,
  isPdfBytes,
} from "@/lib/signatures/target.server";

type Params = Promise<{ token: string; requestId: string }>;

/**
 * Serves the pending document for the in-portal signing viewer. Proxied
 * through the app (same-origin) so pdf.js can fetch it without depending on
 * storage CORS; only pending requests are readable here — once signed, the
 * stamped copy has its own route.
 */
export async function GET(req: NextRequest, props: { params: Params }) {
  const { token, requestId } = await props.params;
  const room = await resolvePartnerRoomByToken(token).catch(() => null);
  const t = getRoomDict(room?.locale).api;
  if (!room) {
    return NextResponse.json({ error: t.roomNotFound }, { status: 404 });
  }
  if (!(await isPartnerRoomUnlocked(room))) {
    return NextResponse.json({ error: t.roomLocked }, { status: 401 });
  }

  const request = await getSignatureRequest({ roomId: room.id, requestId }).catch(
    () => null,
  );
  if (!request || request.status !== "pending") {
    return NextResponse.json({ error: t.signUnavailable }, { status: 404 });
  }

  const bytes = await fetchSignatureTargetBytes({
    token,
    roomId: room.id,
    targetKind: request.targetKind,
    targetId: request.targetId,
  });
  if (!bytes) {
    return NextResponse.json(
      { error: t.docLoadFailed },
      { status: 404 },
    );
  }
  if (!isPdfBytes(bytes)) {
    // The client falls back to the pad-only signing sheet for non-PDF targets.
    return NextResponse.json({ error: "not-pdf" }, { status: 415 });
  }

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
    },
  });
}
