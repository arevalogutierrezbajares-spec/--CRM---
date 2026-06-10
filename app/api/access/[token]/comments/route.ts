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
  body: z.string().trim().min(1, "Write a comment first").max(4000),
});

type Params = Promise<{ token: string }>;

export async function POST(req: NextRequest, props: { params: Params }) {
  const { token } = await props.params;
  const room = await resolvePartnerRoomByToken(token).catch(() => null);
  if (!room) {
    return NextResponse.json({ error: "Room not found or access expired" }, { status: 404 });
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
    return NextResponse.json({ error: "Write a comment first" }, { status: 400 });
  }

  const exists = await commentTargetExists({
    roomId: room.id,
    targetKind: parsed.data.targetKind,
    targetId: parsed.data.targetId,
  }).catch(() => false);
  if (!exists) {
    return NextResponse.json({ error: "That item isn't in this room" }, { status: 404 });
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
    return NextResponse.json({ error: "Write a comment first" }, { status: 400 });
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
