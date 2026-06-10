import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/** Flood guard for the public comments route: guest comments in this room recently. */
export async function countRecentGuestComments(input: {
  roomId: string;
  seconds: number;
}): Promise<number> {
  const since = new Date(Date.now() - input.seconds * 1000);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.partnerItemComments)
    .where(
      and(
        eq(schema.partnerItemComments.roomId, input.roomId),
        eq(schema.partnerItemComments.authorKind, "guest"),
        gt(schema.partnerItemComments.createdAt, since),
      ),
    );
  return row?.count ?? 0;
}

export type PartnerRoomItem = typeof schema.partnerRoomItems.$inferSelect;
export type PartnerItemComment = typeof schema.partnerItemComments.$inferSelect;

export async function listRoomItems(input: {
  roomId: string;
}): Promise<PartnerRoomItem[]> {
  return db
    .select()
    .from(schema.partnerRoomItems)
    .where(eq(schema.partnerRoomItems.roomId, input.roomId))
    .orderBy(asc(schema.partnerRoomItems.sortOrder), asc(schema.partnerRoomItems.createdAt));
}

export async function listRoomComments(input: {
  roomId: string;
}): Promise<PartnerItemComment[]> {
  return db
    .select()
    .from(schema.partnerItemComments)
    .where(eq(schema.partnerItemComments.roomId, input.roomId))
    .orderBy(asc(schema.partnerItemComments.createdAt))
    .limit(1000);
}

export async function getRoomItem(input: {
  roomId: string;
  itemId: string;
}): Promise<PartnerRoomItem | null> {
  const [item] = await db
    .select()
    .from(schema.partnerRoomItems)
    .where(
      and(
        eq(schema.partnerRoomItems.id, input.itemId),
        eq(schema.partnerRoomItems.roomId, input.roomId),
      ),
    )
    .limit(1);
  return item ?? null;
}

export async function createRoomItem(input: {
  workspaceId: string;
  roomId: string;
  kind: "link" | "file";
  title: string;
  description?: string | null;
  url?: string | null;
  storagePath?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  addedBy: string;
}): Promise<PartnerRoomItem> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.partnerRoomItems)
      .values({
        workspaceId: input.workspaceId,
        roomId: input.roomId,
        kind: input.kind,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        url: input.url?.trim() || null,
        storagePath: input.storagePath ?? null,
        mimeType: input.mimeType ?? null,
        sizeBytes: input.sizeBytes ?? null,
      })
      .returning();

    await tx
      .update(schema.partnerRooms)
      .set({ lastActivityAt: now, updatedAt: now })
      .where(eq(schema.partnerRooms.id, input.roomId));

    await tx.insert(schema.partnerAccessEvents).values({
      workspaceId: input.workspaceId,
      roomId: input.roomId,
      actorUserId: input.addedBy,
      eventType: "item_added",
      metadata: { kind: input.kind, title: input.title.trim() },
    });

    return row;
  });
}

export async function updateRoomItem(input: {
  workspaceId: string;
  itemId: string;
  title?: string;
  description?: string | null;
}) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.description !== undefined) patch.description = input.description?.trim() || null;

  const [row] = await db
    .update(schema.partnerRoomItems)
    .set(patch)
    .where(
      and(
        eq(schema.partnerRoomItems.id, input.itemId),
        eq(schema.partnerRoomItems.workspaceId, input.workspaceId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function deleteRoomItem(input: {
  workspaceId: string;
  itemId: string;
}) {
  const [deleted] = await db
    .delete(schema.partnerRoomItems)
    .where(
      and(
        eq(schema.partnerRoomItems.id, input.itemId),
        eq(schema.partnerRoomItems.workspaceId, input.workspaceId),
      ),
    )
    .returning();
  return deleted ?? null;
}

export async function addItemComment(input: {
  workspaceId: string;
  roomId: string;
  targetKind: "share" | "item";
  targetId: string;
  authorKind: "owner" | "guest";
  authorUserId?: string | null;
  authorMemberId?: string | null;
  authorName?: string | null;
  body: string;
}): Promise<PartnerItemComment | null> {
  const body = input.body.trim();
  if (!body) return null;

  const now = new Date();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.partnerItemComments)
      .values({
        workspaceId: input.workspaceId,
        roomId: input.roomId,
        targetKind: input.targetKind,
        targetId: input.targetId,
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
      eventType: "item_commented",
      metadata: {
        authorKind: input.authorKind,
        targetKind: input.targetKind,
        preview: body.slice(0, 120),
      },
    });

    return row;
  });
}

export async function deleteItemComment(input: {
  workspaceId: string;
  commentId: string;
}) {
  const [deleted] = await db
    .delete(schema.partnerItemComments)
    .where(
      and(
        eq(schema.partnerItemComments.id, input.commentId),
        eq(schema.partnerItemComments.workspaceId, input.workspaceId),
      ),
    )
    .returning();
  return deleted ?? null;
}

/** Verify a comment target exists in this room (used by the public comment route). */
export async function commentTargetExists(input: {
  roomId: string;
  targetKind: "share" | "item";
  targetId: string;
}): Promise<boolean> {
  if (input.targetKind === "item") {
    const [row] = await db
      .select({ id: schema.partnerRoomItems.id })
      .from(schema.partnerRoomItems)
      .where(
        and(
          eq(schema.partnerRoomItems.id, input.targetId),
          eq(schema.partnerRoomItems.roomId, input.roomId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }
  const [row] = await db
    .select({ id: schema.partnerShares.id })
    .from(schema.partnerShares)
    .where(
      and(
        eq(schema.partnerShares.id, input.targetId),
        eq(schema.partnerShares.roomId, input.roomId),
      ),
    )
    .limit(1);
  return Boolean(row);
}
