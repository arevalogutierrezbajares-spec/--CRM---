import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  claimPartnerRoomSeat,
  resolvePartnerRoomByToken,
} from "@/db/queries/partner-access";
import {
  PARTNER_GATE_COOKIE_OPTIONS,
  isPartnerRoomUnlocked,
  partnerMemberCookieName,
} from "@/lib/partner-room-gate.server";

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  name: z.string().trim().max(120).optional(),
  memberId: z.string().uuid().optional(),
});

type Params = Promise<{ token: string }>;

export async function POST(req: NextRequest, props: { params: Params }) {
  const { token } = await props.params;
  const room = await resolvePartnerRoomByToken(token).catch(() => null);
  if (!room) {
    return NextResponse.json(
      { error: "Room not found or access expired" },
      { status: 404 },
    );
  }
  // PIN must be cleared before a seat can be claimed.
  if (!(await isPartnerRoomUnlocked(room))) {
    return NextResponse.json({ error: "Room is locked" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
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
    return NextResponse.json({ error: "Could not sign you in" }, { status: 500 });
  }
  if (!result.ok) {
    if (result.error === "seat_full") {
      return NextResponse.json(
        { error: "This room is full. Ask the host to add a seat." },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Please enter your name" }, { status: 400 });
  }

  const res = NextResponse.json({
    ok: true,
    email: result.member.email,
    name: result.member.displayName,
  });
  res.cookies.set(
    partnerMemberCookieName(room.id),
    result.member.id,
    PARTNER_GATE_COOKIE_OPTIONS,
  );
  return res;
}
