import "server-only";
import { and, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";

const { posts, postMentions, postRefs, postReactions, notifications, users, workspaceMembers } = schema;
// Second alias of users so a notification can join BOTH the post author and the
// actor (who assigned/pinged) in one query.
const actorUsers = alias(users, "actor_users");

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

export type PostReactionView = { emoji: string; count: number; mine: boolean };

export type PostView = {
  id: string;
  body: string;
  kind: "message" | "note";
  createdAt: Date;
  authorId: string;
  authorName: string;
  parentPostId: string | null;
  mentions: PostMentionView[];
  refs: PostRefView[];
  reactions: PostReactionView[];
};

/**
 * Newest-first feed for a workspace, with author name + mentions + refs
 * hydrated in a small number of queries (no N+1).
 */
export async function listPosts(opts: {
  workspaceId: string;
  viewerId?: string;
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
      parentPostId: posts.parentPostId,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(eq(posts.workspaceId, opts.workspaceId))
    .orderBy(desc(posts.createdAt))
    .limit(opts.limit ?? 100);

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [mentionRows, refRows, reactionRows] = await Promise.all([
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
    db
      .select({
        postId: postReactions.postId,
        emoji: postReactions.emoji,
        userId: postReactions.userId,
      })
      .from(postReactions)
      .where(inArray(postReactions.postId, ids)),
  ]);

  // Bucket once (avoid O(posts × rows) re-filtering).
  const mentionsBy = new Map<string, PostMentionView[]>();
  for (const m of mentionRows) {
    (mentionsBy.get(m.postId) ?? mentionsBy.set(m.postId, []).get(m.postId)!).push({
      userId: m.userId,
      displayName: m.displayName,
    });
  }
  const refsBy = new Map<string, PostRefView[]>();
  for (const rf of refRows) {
    (refsBy.get(rf.postId) ?? refsBy.set(rf.postId, []).get(rf.postId)!).push({
      id: rf.id,
      refType: rf.refType,
      refId: rf.refId,
      label: rf.label,
    });
  }
  // emoji → { count, mine } per post.
  const reactionsBy = new Map<string, Map<string, { count: number; mine: boolean }>>();
  for (const r of reactionRows) {
    const m = reactionsBy.get(r.postId) ?? reactionsBy.set(r.postId, new Map()).get(r.postId)!;
    const cur = m.get(r.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (opts.viewerId && r.userId === opts.viewerId) cur.mine = true;
    m.set(r.emoji, cur);
  }

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    kind: r.kind,
    createdAt: r.createdAt,
    authorId: r.authorId,
    authorName: r.authorName,
    parentPostId: r.parentPostId ?? null,
    mentions: mentionsBy.get(r.id) ?? [],
    refs: refsBy.get(r.id) ?? [],
    reactions: Array.from(reactionsBy.get(r.id)?.entries() ?? []).map(([emoji, v]) => ({
      emoji,
      count: v.count,
      mine: v.mine,
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
  /** Reply target (light threading). */
  parentPostId?: string | null;
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
        parentPostId: input.parentPostId ?? null,
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
  /** Display name of whoever triggered it (actor for items, author for posts). */
  authorName: string | null;
  entityType: string | null;
  entityId: string | null;
  title: string | null;
  snoozedUntil: Date | null;
  /** Where clicking the notification goes. */
  href: string;
};

/** Deep-link for a notification — to the item drawer, the meeting, or the feed. */
function notificationHref(entityType: string | null, entityId: string | null): string {
  if (entityType && entityId) {
    if (entityType === "action_item" || entityType === "milestone") return `/?item=${entityType}:${entityId}`;
    if (entityType === "meeting") return `/meetings/${entityId}`;
    if (entityType === "partner_room") return `/partner-access/rooms/${entityId}`;
  }
  return "/town-hall";
}

/**
 * Insert notifications for a generic entity (action item / task / meeting).
 * Dedupes recipients and, by default, excludes the actor unless `includeActor`
 * (self-notify). Returns how many were created.
 */
export async function notifyUsers(opts: {
  workspaceId: string;
  actorId: string;
  recipientUserIds: string[];
  entityType: string;
  entityId: string;
  title: string;
  kind: string;
  includeActor?: boolean;
  /** When true, clear any existing unread same-(user,entity,kind) row first
   *  (reminders/pings) so repeats don't pile up. */
  dedupe?: boolean;
}): Promise<number> {
  const requested = Array.from(new Set(opts.recipientUserIds)).filter(
    (id) => opts.includeActor || id !== opts.actorId,
  );
  if (requested.length === 0) return 0;

  // SECURITY: only notify actual members of this workspace. recipientUserIds
  // can originate from the client (mention combobox), so a foreign id must
  // never get a notification row pointing into this workspace.
  const members = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, opts.workspaceId), inArray(workspaceMembers.userId, requested)));
  const recipients = members.map((m) => m.userId);
  if (recipients.length === 0) return 0;

  // Auto-unsnooze: new activity on this entity resurfaces any snoozed
  // notification about it (Linear's "snooze is a timer OR a trigger").
  await db
    .update(notifications)
    .set({ snoozedUntil: null })
    .where(
      and(
        eq(notifications.workspaceId, opts.workspaceId),
        inArray(notifications.userId, recipients),
        eq(notifications.entityType, opts.entityType),
        eq(notifications.entityId, opts.entityId),
        isNull(notifications.readAt),
      ),
    );

  if (opts.dedupe) {
    await db
      .delete(notifications)
      .where(
        and(
          eq(notifications.workspaceId, opts.workspaceId),
          inArray(notifications.userId, recipients),
          eq(notifications.entityType, opts.entityType),
          eq(notifications.entityId, opts.entityId),
          eq(notifications.kind, opts.kind),
          isNull(notifications.readAt),
        ),
      );
  }

  await db.insert(notifications).values(
    recipients.map((userId) => ({
      workspaceId: opts.workspaceId,
      userId,
      actorId: opts.actorId,
      entityType: opts.entityType,
      entityId: opts.entityId,
      title: opts.title.slice(0, 300),
      kind: opts.kind,
    })),
  );
  return recipients.length;
}

/** Notifications are "active" (in the inbox queue) when unread AND not snoozed. */
function notSnoozed() {
  return or(isNull(notifications.snoozedUntil), lte(notifications.snoozedUntil, sql`now()`));
}

/**
 * Notifications for a recipient, newest first. `activeOnly` = the inbox queue
 * (unread + not currently snoozed); otherwise everything (the bell history).
 */
export async function listNotifications(opts: {
  workspaceId: string;
  userId: string;
  limit?: number;
  activeOnly?: boolean;
}): Promise<NotificationView[]> {
  const conds = [eq(notifications.workspaceId, opts.workspaceId), eq(notifications.userId, opts.userId)];
  if (opts.activeOnly) {
    conds.push(isNull(notifications.readAt));
    conds.push(notSnoozed()!);
  }
  const rows = await db
    .select({
      id: notifications.id,
      postId: notifications.postId,
      kind: notifications.kind,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      entityType: notifications.entityType,
      entityId: notifications.entityId,
      title: notifications.title,
      snoozedUntil: notifications.snoozedUntil,
      body: posts.body,
      postAuthor: users.displayName,
      actorName: actorUsers.displayName,
    })
    .from(notifications)
    .leftJoin(posts, eq(posts.id, notifications.postId))
    .leftJoin(users, eq(users.id, posts.authorId))
    .leftJoin(actorUsers, eq(actorUsers.id, notifications.actorId))
    .where(and(...conds))
    .orderBy(desc(notifications.createdAt))
    .limit(opts.limit ?? 30);

  return rows.map((r) => ({
    id: r.id,
    postId: r.postId,
    kind: r.kind,
    readAt: r.readAt,
    createdAt: r.createdAt,
    body: r.body,
    authorName: r.actorName ?? r.postAuthor,
    entityType: r.entityType,
    entityId: r.entityId,
    title: r.title,
    snoozedUntil: r.snoozedUntil,
    href: notificationHref(r.entityType, r.entityId),
  }));
}

/** Snooze (or un-snooze with null) a notification — workspace+user fenced. */
export async function snoozeNotification(opts: {
  workspaceId: string;
  userId: string;
  id: string;
  until: Date | null;
}): Promise<boolean> {
  const res = await db
    .update(notifications)
    .set({ snoozedUntil: opts.until })
    .where(
      and(
        eq(notifications.id, opts.id),
        eq(notifications.workspaceId, opts.workspaceId),
        eq(notifications.userId, opts.userId),
      ),
    )
    .returning({ id: notifications.id });
  return res.length > 0;
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
        notSnoozed(),
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

/** True if the post exists in the given workspace (used to fence reply parents). */
export async function postExistsInWorkspace(workspaceId: string, postId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.workspaceId, workspaceId)))
    .limit(1);
  return Boolean(row);
}

/**
 * Toggle an emoji reaction on a post for a user. Workspace-fenced (the post
 * must belong to `workspaceId`, else no-op) and atomic — the on/off decision is
 * derived from whether the DELETE removed a row, so concurrent toggles can't
 * desync the way a read-then-write would. Returns `{ ok, on }`.
 */
export async function toggleReaction(opts: {
  postId: string;
  userId: string;
  emoji: string;
  workspaceId: string;
}): Promise<{ ok: boolean; on: boolean }> {
  // Fence: the post must be in the caller's workspace (prevents cross-workspace
  // reaction IDOR — postReactions has no workspace column of its own).
  const [post] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.id, opts.postId), eq(posts.workspaceId, opts.workspaceId)))
    .limit(1);
  if (!post) return { ok: false, on: false };

  // Atomic: delete-if-present (one statement); if nothing was removed, insert.
  const removed = await db
    .delete(postReactions)
    .where(
      and(
        eq(postReactions.postId, opts.postId),
        eq(postReactions.userId, opts.userId),
        eq(postReactions.emoji, opts.emoji),
      ),
    )
    .returning({ id: postReactions.id });
  if (removed.length) return { ok: true, on: false };
  await db
    .insert(postReactions)
    .values({ postId: opts.postId, userId: opts.userId, emoji: opts.emoji })
    .onConflictDoNothing();
  return { ok: true, on: true };
}
