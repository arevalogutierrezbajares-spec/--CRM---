import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getPartnerRoomMember,
  resolvePartnerRoomByToken,
} from "@/db/queries/partner-access";
import {
  countRecentPartnerMessages,
  createPartnerRoomMessage,
} from "@/db/queries/partner-messages";
import {
  getPartnerMemberIdFromCookies,
  isPartnerRoomUnlocked,
} from "@/lib/partner-room-gate.server";

const Body = z.object({
  body: z.string().trim().min(1, "Escribe un mensaje primero").max(4000),
});

// Soft flood guard for the unauthenticated composer.
const RATE_WINDOW_SECONDS = 60;
const RATE_MAX_IN_WINDOW = 15;

type Params = Promise<{ token: string }>;

export async function POST(req: NextRequest, props: { params: Params }) {
  const { token } = await props.params;
  const room = await resolvePartnerRoomByToken(token).catch(() => null);
  if (!room) {
    return NextResponse.json(
      { error: "Sala no encontrada o acceso expirado" },
      { status: 404 },
    );
  }
  if (!(await isPartnerRoomUnlocked(room))) {
    return NextResponse.json({ error: "La sala está bloqueada" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Escribe un mensaje primero" }, { status: 400 });
  }

  const recent = await countRecentPartnerMessages({
    roomId: room.id,
    seconds: RATE_WINDOW_SECONDS,
  }).catch(() => 0);
  if (recent >= RATE_MAX_IN_WINDOW) {
    return NextResponse.json(
      { error: "Estás enviando mensajes muy rápido. Espera un momento." },
      { status: 429 },
    );
  }

  const memberId = await getPartnerMemberIdFromCookies(room.id);
  const member = memberId
    ? await getPartnerRoomMember({ roomId: room.id, memberId }).catch(() => null)
    : null;

  const message = await createPartnerRoomMessage({
    workspaceId: room.workspaceId,
    roomId: room.id,
    authorKind: "partner",
    authorMemberId: member?.id ?? null,
    authorName: member?.displayName ?? member?.email ?? null,
    body: parsed.data.body,
  });

  if (!message) {
    return NextResponse.json({ error: "Escribe un mensaje primero" }, { status: 400 });
  }

  return NextResponse.json({
    id: message.id,
    body: message.body,
    authorKind: message.authorKind,
    authorName: message.authorName,
    createdAt: message.createdAt,
  });
}
