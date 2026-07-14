import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  claimPartnerRoomSeat,
  countRecentSeatClaims,
  resolvePartnerRoomByToken,
} from "@/db/queries/partner-access";
import {
  PARTNER_GATE_COOKIE_OPTIONS,
  isPartnerRoomUnlocked,
  partnerMemberCookieName,
  partnerMemberCookieValue,
} from "@/lib/partner-room-gate.server";
import { getRoomDict } from "@/lib/partner-room-i18n";

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  name: z.string().trim().max(120).optional(),
  memberId: z.string().uuid().optional(),
});

type Params = Promise<{ token: string }>;

export async function POST(req: NextRequest, props: { params: Params }) {
  const { token } = await props.params;
  const room = await resolvePartnerRoomByToken(token).catch(() => null);
  const t = getRoomDict(room?.locale).api;
  if (!room) {
    return NextResponse.json({ error: t.roomNotFound }, { status: 404 });
  }
  // PIN must be cleared before a seat can be claimed.
  if (!(await isPartnerRoomUnlocked(room))) {
    return NextResponse.json({ error: t.roomLocked }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: t.invalidRequest }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: t.validEmail }, { status: 400 });
  }

  // Soft flood guard: a visitor can't mass-create member rows in a room
  // that has no seat limit configured.
  const recent = await countRecentSeatClaims({ roomId: room.id, seconds: 60 }).catch(
    () => 0,
  );
  if (recent >= 10) {
    return NextResponse.json({ error: t.signInBurst }, { status: 429 });
  }

  const result = await claimPartnerRoomSeat({
    workspaceId: room.workspaceId,
    roomId: room.id,
    contactId: room.primaryContactId,
    email: parsed.data.email,
    name: parsed.data.name ?? null,
    memberId: parsed.data.memberId ?? null,
    seatLimit: room.seatLimit,
  }).catch(() => null);

  if (!result) {
    return NextResponse.json({ error: t.signInFailed }, { status: 500 });
  }
  if (!result.ok) {
    if (result.error === "seat_full") {
      return NextResponse.json({ error: t.seatFull }, { status: 403 });
    }
    return NextResponse.json({ error: t.nameRequired }, { status: 400 });
  }

  const res = NextResponse.json({
    ok: true,
    email: result.member.email,
    name: result.member.displayName,
  });
  res.cookies.set(
    partnerMemberCookieName(room.id),
    partnerMemberCookieValue(room.id, result.member.id),
    PARTNER_GATE_COOKIE_OPTIONS,
  );
  return res;
}
