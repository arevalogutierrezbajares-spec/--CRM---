import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const { posts, postMentions, postRefs, notifications, users } = schema;

export type PostRefType =
  | "action_item"
  | "milestone"
  | "meeting"
  | "project"
  | "doc";

export type PostMentionView = { userId: string; displayName: string };
export type PostRefView = {
  id: string;
  refType: PostRefType;
  refId: string;
  label: string;
};

export type PostView = {
  id: string;
  body: string;
  kind: "message" | "note";
  createdAt: Date;
  authorId: string;
  authorName: string;
  mentions: PostMentionView[];
  refs: PostRefView[];
};

/**
 * Newest-first feed for a workspace, with author name + mentions + refs
 * hydrated in a small number of queries (no N+1).
 */
export async function listPosts(opts: {
  workspaceId: string;
  limit?: number;
}): Promise<PostView[]> {
  const rows = await db
    .select({
      id: posts.id,
      body: posts.body,
      kind: posts.kind,
      createdAt: posts.createdAt,
      authorId: posts.authorId,
      authorName: users.displayName,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(eq(posts.workspaceId, opts.workspaceId))
    .orderBy(desc(posts.createdAt))
    .limit(opts.limit ?? 100);

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [mentionRows, refRows] = await Promise.all([
    db
      .select({
        postId: postMentions.postId,
        userId: postMentions.userId,
        displayName: users.displayName,
      })
      .from(postMentions)
      .innerJoin(users, eq(users.id, postMentions.userId))
      .where(inArray(postMentions.postId, ids)),
    db
      .select({
        id: postRefs.id,
        postId: postRefs.postId,
        refType: postRefs.refType,
        refId: postRefs.refId,
        label: postRefs.label,
      })
      .from(postRefs)
      .where(inArray(postRefs.postId, ids)),
  ]);

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    kind: r.kind,
    createdAt: r.createdAt,
    authorId: r.authorId,
    authorName: r.authorName,
    mentions: mentionRows
      .filter((m) => m.postId === r.id)
      .map((m) => ({ userId: m.userId, displayName: m.displayName })),
    refs: refRows
      .filter((rf) => rf.postId === r.id)
      .map((rf) => ({
        id: rf.id,
        refType: rf.refType,
        refId: rf.refId,
        label: rf.label,
      })),
  }));
}

export type NewPostInput = {
  workspaceId: string;
  authorId: string;
  body: string;
  kind?: "message" | "note";
  /** Resolved + validated mentioned user ids (recipients of notifications). */
  mentionUserIds: string[];
  /** Resolved + validated object references. */
  refs: Array<{ refType: PostRefType; refId: string; label: string }>;
};

/**
 * Insert a post + its mentions + refs + one notification per mentioned user
 * (excluding the author) in a single transaction. Returns the new post id.
 */
export async function createPost(input: NewPostInput): Promise<string> {
  return db.transaction(async (tx) => {
    const [post] = await tx
      .insert(posts)
      .values({
        workspaceId: input.workspaceId,
        authorId: input.authorId,
        body: input.body,
        kind: input.kind ?? "message",
      })
      .returning({ id: posts.id });

    const uniqueMentions = Array.from(new Set(input.mentionUserIds));

    if (uniqueMentions.length > 0) {
      await tx.insert(postMentions).values(
        uniqueMentions.map((userId) => ({ postId: post.id, userId })),
      );
    }

    if (input.refs.length > 0) {
      await tx.insert(postRefs).values(
        input.refs.map((r) => ({
          postId: post.id,
          refType: r.refType,
          refId: r.refId,
          label: r.label,
        })),
      );
    }

    // Notify everyone mentioned except the author.
    const recipients = uniqueMentions.filter((u) => u !== input.authorId);
    if (recipients.length > 0) {
      await tx.insert(notifications).values(
        recipients.map((userId) => ({
          workspaceId: input.workspaceId,
          userId,
          postId: post.id,
          kind: "mention",
        })),
      );
    }

    return post.id;
  });
}

export type NotificationView = {
  id: string;
  postId: string | null;
  kind: string;
  readAt: Date | null;
  createdAt: Date;
  body: string | null;
  authorName: string | null;
};

/** Recent notifications for a recipient in a workspace, newest first. */
export async function listNotifications(opts: {
  workspaceId: string;
  userId: string;
  limit?: number;
}): Promise<NotificationView[]> {
  const rows = await db
    .select({
      id: notifications.id,
      postId: notifications.postId,
      kind: notifications.kind,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      body: posts.body,
      authorName: users.displayName,
    })
    .from(notifications)
    .leftJoin(posts, eq(posts.id, notifications.postId))
    .leftJoin(users, eq(users.id, posts.authorId))
    .where(
      and(
        eq(notifications.workspaceId, opts.workspaceId),
        eq(notifications.userId, opts.userId),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(opts.limit ?? 30);

  return rows.map((r) => ({
    id: r.id,
    postId: r.postId,
    kind: r.kind,
    readAt: r.readAt,
    createdAt: r.createdAt,
    body: r.body,
    authorName: r.authorName,
  }));
}

/** Count of unread notifications for a recipient. */
export async function unreadCount(opts: {
  workspaceId: string;
  userId: string;
}): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.workspaceId, opts.workspaceId),
        eq(notifications.userId, opts.userId),
        isNull(notifications.readAt),
      ),
    );
  return row?.n ?? 0;
}

/**
 * Mark notifications read for a recipient. Pass `ids` to mark specific ones,
 * otherwise marks all unread for the user.
 */
export async function markNotificationsRead(opts: {
  workspaceId: string;
  userId: string;
  ids?: string[];
}): Promise<void> {
  const conditions = [
    eq(notifications.workspaceId, opts.workspaceId),
    eq(notifications.userId, opts.userId),
    isNull(notifications.readAt),
  ];
  if (opts.ids && opts.ids.length > 0) {
    conditions.push(inArray(notifications.id, opts.ids));
  }
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(...conditions));
}
