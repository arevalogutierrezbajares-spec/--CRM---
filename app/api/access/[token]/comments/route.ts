import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getPartnerRoomMember,
  resolvePartnerRoomByToken,
} from "@/db/queries/partner-access";
import { addItemComment, commentTargetExists } from "@/db/queries/partner-repository";
import {
  getPartnerMemberIdFromCookies,
  isPartnerRoomUnlocked,
} from "@/lib/partner-room-gate.server";

const Body = z.object({
  targetKind: z.enum(["share", "item"]),
  targetId: z.string().uuid(),
  body: z.string().trim().min(1, "Escribe un comentario primero").max(4000),
});

type Params = Promise<{ token: string }>;

export async function POST(req: NextRequest, props: { params: Params }) {
  const { token } = await props.params;
  const room = await resolvePartnerRoomByToken(token).catch(() => null);
  if (!room) {
    return NextResponse.json({ error: "Sala no encontrada o acceso expirado" }, { status: 404 });
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
    return NextResponse.json({ error: "Escribe un comentario primero" }, { status: 400 });
  }

  const exists = await commentTargetExists({
    roomId: room.id,
    targetKind: parsed.data.targetKind,
    targetId: parsed.data.targetId,
  }).catch(() => false);
  if (!exists) {
    return NextResponse.json({ error: "Ese elemento no está en esta sala" }, { status: 404 });
  }

  const memberId = await getPartnerMemberIdFromCookies(room.id);
  const member = memberId
    ? await getPartnerRoomMember({ roomId: room.id, memberId }).catch(() => null)
    : null;

  const comment = await addItemComment({
    workspaceId: room.workspaceId,
    roomId: room.id,
    targetKind: parsed.data.targetKind,
    targetId: parsed.data.targetId,
    authorKind: "guest",
    authorMemberId: member?.id ?? null,
    authorName: member?.displayName ?? member?.email ?? null,
    body: parsed.data.body,
  });
  if (!comment) {
    return NextResponse.json({ error: "Escribe un comentario primero" }, { status: 400 });
  }

  return NextResponse.json({
    id: comment.id,
    targetKind: comment.targetKind,
    targetId: comment.targetId,
    body: comment.body,
    authorKind: comment.authorKind,
    authorName: comment.authorName,
    createdAt: comment.createdAt,
  });
}
