import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  countPartnerRoomMembers,
  getPartnerMemberByEmail,
  identifyPartnerRoomMember,
  resolvePartnerRoomByToken,
} from "@/db/queries/partner-access";
import {
  PARTNER_GATE_COOKIE_OPTIONS,
  isPartnerRoomUnlocked,
  partnerMemberCookieName,
} from "@/lib/partner-room-gate.server";

const MAX_MEMBERS_PER_ROOM = 200;

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  name: z.string().trim().max(120).optional(),
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

  // Cap unbounded member growth from scripted submissions — existing members
  // (re-identifying) are always allowed through.
  const existing = await getPartnerMemberByEmail({
    roomId: room.id,
    email: parsed.data.email,
  }).catch(() => null);
  if (!existing) {
    const count = await countPartnerRoomMembers({ roomId: room.id }).catch(() => 0);
    if (count >= MAX_MEMBERS_PER_ROOM) {
      return NextResponse.json(
        { error: "This room is not accepting new sign-ins right now." },
        { status: 429 },
      );
    }
  }

  const member = await identifyPartnerRoomMember({
    workspaceId: room.workspaceId,
    roomId: room.id,
    contactId: room.primaryContactId,
    email: parsed.data.email,
    displayName: parsed.data.name ?? null,
  });

  const res = NextResponse.json({
    ok: true,
    email: member.email,
    name: member.displayName,
  });
  res.cookies.set(
    partnerMemberCookieName(room.id),
    member.id,
    PARTNER_GATE_COOKIE_OPTIONS,
  );
  return res;
}
