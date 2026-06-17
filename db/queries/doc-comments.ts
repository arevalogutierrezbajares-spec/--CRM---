import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { notifyUsers } from "./town-hall";

const { docComments, docCommentMentions, projectLinks, users } = schema;

export type DocCommentMentionView = { userId: string; displayName: string };

export type DocCommentView = {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: Date;
  mentions: DocCommentMentionView[];
};

/** A commentable document — any project_links row in the given workspace. */
export type CommentableLink = {
  linkId: string;
  lobId: string;
  label: string;
  kind: "note" | "link" | "file" | "doc";
};

/** Resolve a link by id, fenced to the workspace. Null if it doesn't exist or
 *  belongs to another workspace (used to fence every comment mutation). */
export async function getCommentableLink(opts: {
  workspaceId: string;
  linkId: string;
}): Promise<CommentableLink | null> {
  const [row] = await db
    .select({
      linkId: projectLinks.id,
      lobId: projectLinks.lobId,
      label: projectLinks.label,
      kind: projectLinks.kind,
    })
    .from(projectLinks)
    .where(
      and(
        eq(projectLinks.id, opts.linkId),
        eq(projectLinks.workspaceId, opts.workspaceId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * All (non-deleted) comments on a link, oldest first, with author names +
 * mentions hydrated in a small, fixed number of queries (no N+1).
 */
export async function listDocComments(opts: {
  workspaceId: string;
  linkId: string;
}): Promise<DocCommentView[]> {
  const rows = await db
    .select({
      id: docComments.id,
      body: docComments.body,
      authorId: docComments.authorId,
      authorName: users.displayName,
      createdAt: docComments.createdAt,
    })
    .from(docComments)
    .innerJoin(users, eq(users.id, docComments.authorId))
    .where(
      and(
        eq(docComments.workspaceId, opts.workspaceId),
        eq(docComments.linkId, opts.linkId),
        isNull(docComments.deletedAt),
      ),
    )
    .orderBy(asc(docComments.createdAt));

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const mentionRows = await db
    .select({
      commentId: docCommentMentions.commentId,
      userId: docCommentMentions.userId,
      displayName: users.displayName,
    })
    .from(docCommentMentions)
    .innerJoin(users, eq(users.id, docCommentMentions.userId))
    .where(inArray(docCommentMentions.commentId, ids));

  const mentionsBy = new Map<string, DocCommentMentionView[]>();
  for (const m of mentionRows) {
    (mentionsBy.get(m.commentId) ?? mentionsBy.set(m.commentId, []).get(m.commentId)!).push({
      userId: m.userId,
      displayName: m.displayName,
    });
  }

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    authorId: r.authorId,
    authorName: r.authorName,
    createdAt: r.createdAt,
    mentions: mentionsBy.get(r.id) ?? [],
  }));
}

/**
 * Insert a comment + its mentions in one transaction, then notify each
 * mentioned teammate (except the author) via the shared, membership-checked
 * notifyUsers helper. `mentionUserIds` must already be validated against the
 * workspace roster by the caller. Returns the new id + how many were notified.
 */
export async function createDocComment(input: {
  workspaceId: string;
  linkId: string;
  authorId: string;
  authorName: string;
  linkLabel: string;
  body: string;
  mentionUserIds: string[];
}): Promise<{ commentId: string; notified: number }> {
  const uniqueMentions = Array.from(new Set(input.mentionUserIds));

  const commentId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(docComments)
      .values({
        workspaceId: input.workspaceId,
        linkId: input.linkId,
        authorId: input.authorId,
        body: input.body,
      })
      .returning({ id: docComments.id });

    if (uniqueMentions.length > 0) {
      await tx
        .insert(docCommentMentions)
        .values(uniqueMentions.map((userId) => ({ commentId: row.id, userId })))
        .onConflictDoNothing();
    }
    return row.id;
  });

  // entityId = linkId so the bell deep-links to the document itself. Run after
  // the comment is committed and never let a notification failure lose the
  // saved comment (the mention rows persist regardless).
  let notified = 0;
  if (uniqueMentions.length > 0) {
    try {
      notified = await notifyUsers({
        workspaceId: input.workspaceId,
        actorId: input.authorId,
        recipientUserIds: uniqueMentions,
        entityType: "doc_comment",
        entityId: input.linkId,
        title: `${input.authorName} mentioned you on "${input.linkLabel}"`,
        kind: "mention",
      });
    } catch {
      /* notification is best-effort — the comment + mentions are already saved */
    }
  }

  return { commentId, notified };
}

/**
 * Soft-delete a comment. Allowed for the author, or any workspace owner/admin.
 * Workspace-fenced. Returns true if a row was updated.
 */
export async function deleteDocComment(opts: {
  workspaceId: string;
  commentId: string;
  userId: string;
  isPrivileged: boolean;
}): Promise<boolean> {
  const conds = [
    eq(docComments.id, opts.commentId),
    eq(docComments.workspaceId, opts.workspaceId),
    isNull(docComments.deletedAt),
  ];
  if (!opts.isPrivileged) conds.push(eq(docComments.authorId, opts.userId));

  const res = await db
    .update(docComments)
    .set({ deletedAt: new Date() })
    .where(and(...conds))
    .returning({ id: docComments.id });
  return res.length > 0;
}
