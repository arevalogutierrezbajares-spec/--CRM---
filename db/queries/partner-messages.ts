import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { notifyUsers } from "@/db/queries/town-hall";

export type PartnerRoomMessage = typeof schema.partnerRoomMessages.$inferSelect;

/** How many partner messages landed in this room within the last `seconds`. */
export async function countRecentPartnerMessages(input: {
  roomId: string;
  seconds: number;
}): Promise<number> {
  const since = new Date(Date.now() - input.seconds * 1000);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.partnerRoomMessages)
    .where(
      and(
        eq(schema.partnerRoomMessages.roomId, input.roomId),
        eq(schema.partnerRoomMessages.authorKind, "partner"),
        gt(schema.partnerRoomMessages.createdAt, since),
      ),
    );
  return row?.count ?? 0;
}

export async function listPartnerRoomMessages(input: {
  roomId: string;
}): Promise<PartnerRoomMessage[]> {
  return db
    .select()
    .from(schema.partnerRoomMessages)
    .where(eq(schema.partnerRoomMessages.roomId, input.roomId))
    .orderBy(asc(schema.partnerRoomMessages.createdAt))
    .limit(200);
}

export async function createPartnerRoomMessage(input: {
  workspaceId: string;
  roomId: string;
  authorKind: "owner" | "partner";
  authorUserId?: string | null;
  authorMemberId?: string | null;
  authorName?: string | null;
  body: string;
}): Promise<PartnerRoomMessage | null> {
  const body = input.body.trim();
  if (!body) return null;

  const now = new Date();
  const message = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.partnerRoomMessages)
      .values({
        workspaceId: input.workspaceId,
        roomId: input.roomId,
        authorKind: input.authorKind,
        authorUserId: input.authorUserId ?? null,
        authorMemberId: input.authorMemberId ?? null,
        authorName: input.authorName?.trim() || null,
        body,
      })
      .returning();

    await tx
      .update(schema.partnerRooms)
      .set({ lastActivityAt: now, updatedAt: now })
      .where(eq(schema.partnerRooms.id, input.roomId));

    await tx.insert(schema.partnerAccessEvents).values({
      workspaceId: input.workspaceId,
      roomId: input.roomId,
      actorUserId: input.authorUserId ?? null,
      eventType: "message_posted",
      metadata: {
        authorKind: input.authorKind,
        authorName: input.authorName ?? null,
        preview: body.slice(0, 120),
      },
    });

    return row;
  });

  // Partner messages should surface in the owner's bell, not just the room
  // activity feed. Best-effort — a notification failure must not lose the message.
  if (input.authorKind === "partner") {
    try {
      const [room] = await db
        .select({
          name: schema.partnerRooms.name,
          createdBy: schema.partnerRooms.createdBy,
        })
        .from(schema.partnerRooms)
        .where(eq(schema.partnerRooms.id, input.roomId))
        .limit(1);
      if (room) {
        await notifyUsers({
          workspaceId: input.workspaceId,
          actorId: room.createdBy,
          recipientUserIds: [room.createdBy],
          includeActor: true,
          entityType: "partner_room",
          entityId: input.roomId,
          title: `${input.authorName?.trim() || "Partner"} sent a message in ${room.name}`,
          kind: "partner_message",
          // Collapse a burst of messages from one room into a single unread
          // bell row instead of flooding the owner's inbox.
          dedupe: true,
        });
      }
    } catch {
      // best-effort
    }
  }

  return message;
}

export async function deletePartnerRoomMessage(input: {
  workspaceId: string;
  messageId: string;
}) {
  const [deleted] = await db
    .delete(schema.partnerRoomMessages)
    .where(
      and(
        eq(schema.partnerRoomMessages.id, input.messageId),
        eq(schema.partnerRoomMessages.workspaceId, input.workspaceId),
      ),
    )
    .returning();
  return deleted ?? null;
}
