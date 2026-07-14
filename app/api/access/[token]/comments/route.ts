import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getPartnerRoomMember,
  resolvePartnerRoomByToken,
} from "@/db/queries/partner-access";
import {
  addItemComment,
  commentTargetExists,
  countRecentGuestComments,
} from "@/db/queries/partner-repository";
import {
  getPartnerMemberIdFromCookies,
  isPartnerRoomUnlocked,
} from "@/lib/partner-room-gate.server";
import { getRoomDict } from "@/lib/partner-room-i18n";

const Body = z.object({
  targetKind: z.enum(["share", "item"]),
  targetId: z.string().uuid(),
  body: z.string().trim().min(1, "empty_comment").max(4000),
});

type Params = Promise<{ token: string }>;

export async function POST(req: NextRequest, props: { params: Params }) {
  const { token } = await props.params;
  const room = await resolvePartnerRoomByToken(token).catch(() => null);
  const t = getRoomDict(room?.locale).api;
  if (!room) {
    return NextResponse.json({ error: t.roomNotFound }, { status: 404 });
  }
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
    return NextResponse.json({ error: t.commentRequired }, { status: 400 });
  }

  // Soft flood guard for the unauthenticated composer (mirrors messages route).
  const recent = await countRecentGuestComments({ roomId: room.id, seconds: 60 }).catch(
    () => 0,
  );
  if (recent >= 20) {
    return NextResponse.json({ error: t.commentRateLimit }, { status: 429 });
  }

  const exists = await commentTargetExists({
    roomId: room.id,
    targetKind: parsed.data.targetKind,
    targetId: parsed.data.targetId,
  }).catch(() => false);
  if (!exists) {
    return NextResponse.json({ error: t.itemNotInRoom }, { status: 404 });
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
    return NextResponse.json({ error: t.commentRequired }, { status: 400 });
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
