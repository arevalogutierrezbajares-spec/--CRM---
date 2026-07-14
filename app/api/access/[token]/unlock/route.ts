import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  resolvePartnerRoomByToken,
  verifyPartnerRoomPasscode,
} from "@/db/queries/partner-access";
import {
  PARTNER_GATE_COOKIE_OPTIONS,
  partnerGateCookieName,
  partnerGateCookieValue,
} from "@/lib/partner-room-gate.server";
import { getRoomDict } from "@/lib/partner-room-i18n";

const Body = z.object({
  passcode: z.string().regex(/^\d{4}$/, "invalid_pin"),
});

type Params = Promise<{ token: string }>;

export async function POST(req: NextRequest, props: { params: Params }) {
  const { token } = await props.params;
  // Resolve the room up front only to key error messages to its language.
  const room = await resolvePartnerRoomByToken(token).catch(() => null);
  const t = getRoomDict(room?.locale).api;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: t.invalidRequest }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: t.pinRequired }, { status: 400 });
  }

  const result = await verifyPartnerRoomPasscode({
    token,
    passcode: parsed.data.passcode,
  }).catch(() => null);

  if (!result) {
    return NextResponse.json({ error: t.roomNotFound }, { status: 404 });
  }

  if (!result.ok) {
    if (result.locked) {
      return NextResponse.json(
        {
          error: t.tooManyAttempts,
          locked: true,
          retryAt: result.retryAt,
        },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: t.pinMismatch }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  if (result.passcodeHash) {
    res.cookies.set(
      partnerGateCookieName(result.roomId),
      partnerGateCookieValue(result.roomId, result.passcodeHash),
      PARTNER_GATE_COOKIE_OPTIONS,
    );
  }
  return res;
}
