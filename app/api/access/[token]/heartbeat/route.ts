import { NextResponse } from "next/server";
import {
  resolvePartnerRoomByToken,
  touchPartnerRoomPresence,
} from "@/db/queries/partner-access";
import {
  getPartnerMemberIdFromCookies,
  isPartnerRoomUnlocked,
} from "@/lib/partner-room-gate.server";
import { getRoomDict } from "@/lib/partner-room-i18n";

/**
 * Presence heartbeat from an open room tab (see RoomPulse). Updates viewed
 * timestamps only — never logs an access event — so "en línea ahora" works
 * without polluting the share ledger.
 */
type Params = Promise<{ token: string }>;

export async function POST(_: Request, props: { params: Params }) {
  const { token } = await props.params;
  const room = await resolvePartnerRoomByToken(token).catch(() => null);
  const t = getRoomDict(room?.locale).api;
  if (!room) {
    return NextResponse.json({ error: t.roomNotFound }, { status: 404 });
  }
  if (!(await isPartnerRoomUnlocked(room))) {
    return NextResponse.json({ error: t.roomLocked }, { status: 401 });
  }

  const memberId = await getPartnerMemberIdFromCookies(room.id);
  await touchPartnerRoomPresence({ roomId: room.id, memberId }).catch(() => {});
  return new NextResponse(null, { status: 204 });
}
