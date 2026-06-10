import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyPartnerRoomPasscode } from "@/db/queries/partner-access";
import {
  PARTNER_GATE_COOKIE_OPTIONS,
  partnerGateCookieName,
  partnerGateCookieValue,
} from "@/lib/partner-room-gate.server";

const Body = z.object({
  passcode: z.string().regex(/^\d{4}$/, "Ingresa el código de 4 dígitos"),
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
    return NextResponse.json({ error: "Ingresa el código de 4 dígitos" }, { status: 400 });
  }

  const result = await verifyPartnerRoomPasscode({
    token,
    passcode: parsed.data.passcode,
  }).catch(() => null);

  if (!result) {
    return NextResponse.json(
      { error: "Sala no encontrada o acceso expirado" },
      { status: 404 },
    );
  }

  if (!result.ok) {
    if (result.locked) {
      return NextResponse.json(
        {
          error: "Demasiados intentos. Inténtalo en unos minutos.",
          locked: true,
          retryAt: result.retryAt,
        },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: "Ese código no coincide. Inténtalo de nuevo." },
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
