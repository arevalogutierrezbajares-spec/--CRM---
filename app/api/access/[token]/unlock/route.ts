import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyPartnerRoomPasscode } from "@/db/queries/partner-access";
import {
  PARTNER_GATE_COOKIE_OPTIONS,
  partnerGateCookieName,
  partnerGateCookieValue,
} from "@/lib/partner-room-gate.server";

const Body = z.object({
  passcode: z.string().regex(/^\d{4}$/, "Enter the 4-digit code"),
});

type Params = Promise<{ token: string }>;

export async function POST(req: NextRequest, props: { params: Params }) {
  const { token } = await props.params;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the 4-digit code" }, { status: 400 });
  }

  const result = await verifyPartnerRoomPasscode({
    token,
    passcode: parsed.data.passcode,
  }).catch(() => null);

  if (!result) {
    return NextResponse.json(
      { error: "Room not found or access expired" },
      { status: 404 },
    );
  }

  if (!result.ok) {
    if (result.locked) {
      return NextResponse.json(
        {
          error: "Too many attempts. Try again in a few minutes.",
          locked: true,
          retryAt: result.retryAt,
        },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: "That code didn't match. Try again." },
      { status: 401 },
    );
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
