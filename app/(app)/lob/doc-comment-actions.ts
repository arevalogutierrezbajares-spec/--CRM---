"use server";

import { z } from "zod";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";
import { listWorkspaceMembers } from "@/db/queries/team";
import { extractMentionHandles, handleFromName, snippet } from "@/lib/town-hall/parse";
import { sendWhatsAppText } from "@/lib/whatsapp";
import {
  createDocComment,
  deleteDocComment,
  getCommentableLink,
  listDocComments,
  type DocCommentView,
} from "@/db/queries/doc-comments";

const { users } = schema;

/** Web URL that opens a link's comments: docs have a route, files open via the
 *  ?doc= deep-link the LinksBoard honours on mount. */
function docCommentHref(kind: string, lobId: string, linkId: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return kind === "doc"
    ? `${base}/lob/${lobId}/docs/${linkId}`
    : `${base}/lob/${lobId}?doc=${linkId}`;
}

/** Comments on a document/file, scoped + fenced to the caller's workspace. */
export async function listDocCommentsAction(linkId: string): Promise<DocCommentView[]> {
  const user = await requireUser();
  const link = await getCommentableLink({ workspaceId: user.workspaceId, linkId });
  if (!link) return [];
  return listDocComments({ workspaceId: user.workspaceId, linkId });
}

const createSchema = z.object({
  linkId: z.string().uuid(),
  body: z.string().min(1).max(8000),
  // Explicit ids the composer attached from its @ autocomplete.
  mentionUserIds: z.array(z.string().uuid()).default([]),
});

export type CreateDocCommentResult =
  | { ok: true; comment: DocCommentView; notified: number; waSent: number }
  | { ok: false; error: string };

/**
 * Post a comment on a document/file: resolve + validate @mentions (explicit
 * token ids ∪ bare @handles re-parsed from the body), persist comment +
 * mentions + notifications transactionally, then DM each mentioned teammate
 * who has a WhatsApp number on file. Mirrors createPostAction.
 */
export async function createDocCommentAction(input: {
  linkId: string;
  body: string;
  mentionUserIds?: string[];
}): Promise<CreateDocCommentResult> {
  const user = await requireUser();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid comment" };
  const { linkId, body } = parsed.data;

  const link = await getCommentableLink({ workspaceId: user.workspaceId, linkId });
  if (!link) return { ok: false, error: "Document not found" };

  const members = await listWorkspaceMembers(user.workspaceId);
  const memberById = new Map(members.map((m) => [m.userId, m]));

  // Resolve mentions: explicit ids validated against the roster, PLUS bare
  // @handles re-scanned from the body as a fallback / defense.
  const resolved = new Set<string>();
  for (const id of parsed.data.mentionUserIds) {
    if (memberById.has(id)) resolved.add(id);
  }
  const handleToId = new Map(members.map((m) => [handleFromName(m.displayName), m.userId]));
  for (const handle of extractMentionHandles(body)) {
    const id = handleToId.get(handle);
    if (id) resolved.add(id);
  }
  const mentionUserIds = Array.from(resolved);

  const { commentId, notified } = await createDocComment({
    workspaceId: user.workspaceId,
    linkId,
    authorId: user.id,
    authorName: user.displayName,
    linkLabel: link.label,
    body,
    mentionUserIds,
  });

  // WhatsApp DM to each mentioned teammate (except the author) with a phone.
  const targets = mentionUserIds.filter((id) => id !== user.id);
  let waSent = 0;
  if (targets.length > 0) {
    const link_ = docCommentHref(link.kind, link.lobId, linkId);
    const phoneRows = await db
      .select({ id: users.id, phone: users.whatsappPhone })
      .from(users)
      .where(inArray(users.id, targets));
    await Promise.all(
      phoneRows
        .filter((r) => r.phone)
        .map(async (r) => {
          const msg = `${user.displayName} mentioned you on "${link.label}": "${snippet(body)}" → ${link_}`;
          const res = await sendWhatsAppText({ to: r.phone as string, body: msg });
          if (res.ok) waSent += 1;
        }),
    );
  }

  const comment: DocCommentView = {
    id: commentId,
    body,
    authorId: user.id,
    authorName: user.displayName,
    createdAt: new Date(),
    mentions: mentionUserIds.map((id) => ({
      userId: id,
      displayName: memberById.get(id)?.displayName ?? "",
    })),
  };

  return { ok: true, comment, notified, waSent };
}

/** Soft-delete one of the caller's comments (or any, for owners/admins). */
export async function deleteDocCommentAction(
  commentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const ok = await deleteDocComment({
    workspaceId: user.workspaceId,
    commentId,
    userId: user.id,
    isPrivileged: user.workspaceRole === "owner" || user.workspaceRole === "admin",
  });
  if (!ok) return { ok: false, error: "Comment not found" };
  return { ok: true };
}
