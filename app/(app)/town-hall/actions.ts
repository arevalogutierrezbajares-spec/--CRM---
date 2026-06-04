"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { inArray } from "drizzle-orm";
import { requireUser } from "@/lib/current-user";
import { listWorkspaceMembers } from "@/db/queries/team";
import {
  createPost,
  listPosts,
  toggleReaction,
  postExistsInWorkspace,
  listNotifications,
  markNotificationsRead,
  unreadCount,
  type NotificationView,
  type PostRefType,
  type PostView,
} from "@/db/queries/town-hall";
import {
  createActionItem,
  listProjectsForPicker,
  projectExistsInWorkspace,
} from "@/db/queries/items";
import { sendWhatsAppText } from "@/lib/whatsapp";
import {
  extractMentionHandles,
  handleFromName,
  isRefType,
  snippet,
} from "@/lib/town-hall/parse";
import { extractActionItems } from "@/lib/town-hall/extract";

const { users } = schema;

const refSchema = z.object({
  refType: z.enum(["action_item", "milestone", "meeting", "project", "doc"]),
  refId: z.string().uuid(),
  label: z.string().min(1).max(200),
});

const createPostSchema = z.object({
  body: z.string().min(1).max(8000),
  kind: z.enum(["message", "note"]).default("message"),
  // Explicit tokens the composer attached from its @/# autocomplete.
  mentionUserIds: z.array(z.string().uuid()).default([]),
  refs: z.array(refSchema).default([]),
});

export type CreatePostResult =
  | { ok: true; postId: string; notified: number; waSent: number }
  | { ok: false; error: string };

/**
 * Create a Town Hall post: parse + resolve @mentions and #refs, persist
 * (post + mentions + refs + notifications) transactionally, then fan out a
 * WhatsApp DM to each mentioned member who has a phone on file.
 */
/** Lightweight refresh for the live chat — just the posts, not the whole page. */
export async function loadRecentPostsAction(): Promise<PostView[]> {
  const user = await requireUser();
  return listPosts({ workspaceId: user.workspaceId, viewerId: user.id, limit: 40 });
}

export async function createPostAction(input: {
  body: string;
  kind?: "message" | "note";
  mentionUserIds?: string[];
  refs?: Array<{ refType: PostRefType; refId: string; label: string }>;
  parentPostId?: string | null;
  /** Also broadcast this post to every teammate's WhatsApp. */
  alsoWhatsApp?: boolean;
}): Promise<CreatePostResult> {
  const user = await requireUser();
  const parsed = createPostSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid post payload" };
  }
  const { body, kind, refs } = parsed.data;
  // Validate the reply parent is a real post in THIS workspace (drop to null
  // otherwise — never persist a cross-workspace parent pointer).
  const rawParent = typeof input.parentPostId === "string" ? input.parentPostId : null;
  const parentPostId =
    rawParent && (await postExistsInWorkspace(user.workspaceId, rawParent)) ? rawParent : null;

  const members = await listWorkspaceMembers(user.workspaceId);
  const memberById = new Map(members.map((m) => [m.userId, m]));

  // 1. Resolve mentions: explicit token ids (validated against members) PLUS
  //    bare @handles re-parsed from the body as a fallback.
  const resolved = new Set<string>();
  for (const id of parsed.data.mentionUserIds) {
    if (memberById.has(id)) resolved.add(id);
  }
  const handleToId = new Map(
    members.map((m) => [handleFromName(m.displayName), m.userId]),
  );
  for (const handle of extractMentionHandles(body)) {
    const id = handleToId.get(handle);
    if (id) resolved.add(id);
  }
  const mentionUserIds = Array.from(resolved);

  // 2. Validate refs belong to the workspace. Only `project` refs are checked
  //    against the DB right now (the only object the picker surfaces); other
  //    ref types are trusted as-attached but still workspace-fenced by RLS.
  const validRefs: Array<{
    refType: PostRefType;
    refId: string;
    label: string;
  }> = [];
  for (const r of refs) {
    if (!isRefType(r.refType)) continue;
    if (r.refType === "project") {
      const ok = await projectExistsInWorkspace(user.workspaceId, r.refId);
      if (!ok) continue;
    }
    validRefs.push(r);
  }

  // 3. Persist.
  const postId = await createPost({
    workspaceId: user.workspaceId,
    authorId: user.id,
    body,
    kind,
    mentionUserIds,
    refs: validRefs,
    parentPostId,
  });

  // 4. WhatsApp out. Mentioned members get a DM; if alsoWhatsApp, the whole
  //    team gets it (their inbox is WhatsApp). Each recipient is messaged once.
  const link = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/town-hall`;
  const mentioned = new Set(mentionUserIds.filter((id) => id !== user.id));
  // Team-wide WhatsApp fan-out is a paid, opt-out-less blast — restrict it to
  // owners/admins. Members can still @mention specific teammates (above).
  const canBroadcast = user.workspaceRole === "owner" || user.workspaceRole === "admin";
  const broadcast =
    input.alsoWhatsApp && canBroadcast
      ? new Set(members.map((m) => m.userId).filter((id) => id !== user.id))
      : new Set<string>();
  const targets = Array.from(new Set([...mentioned, ...broadcast]));
  let waSent = 0;
  if (targets.length > 0) {
    const phoneRows = await db
      .select({ id: users.id, phone: users.whatsappPhone })
      .from(users)
      .where(inArray(users.id, targets));
    await Promise.all(
      phoneRows
        .filter((r) => r.phone)
        .map(async (r) => {
          const verb = mentioned.has(r.id) ? "mentioned you in" : "posted to";
          const msg = `${user.displayName} ${verb} town hall: "${snippet(body)}" → ${link}`;
          const res = await sendWhatsAppText({ to: r.phone as string, body: msg });
          if (res.ok) waSent += 1;
        }),
    );
  }

  revalidatePath("/town-hall");
  return { ok: true, postId, notified: mentioned.size, waSent };
}

/** Toggle an emoji reaction on a post. */
export async function toggleReactionAction(opts: {
  postId: string;
  emoji: string;
}): Promise<{ ok: true; on: boolean } | { ok: false; error: string }> {
  const user = await requireUser();
  const emoji = opts.emoji.slice(0, 8);
  const res = await toggleReaction({
    postId: opts.postId,
    userId: user.id,
    emoji,
    workspaceId: user.workspaceId,
  });
  if (!res.ok) return { ok: false, error: "Post not found" };
  return { ok: true, on: res.on };
}

/** Recent notifications for the caller (for the bell dropdown). */
export async function getNotificationsAction(): Promise<NotificationView[]> {
  const user = await requireUser();
  return listNotifications({
    workspaceId: user.workspaceId,
    userId: user.id,
    limit: 20,
  });
}

/** Unread notification count for the caller (for the bell badge). */
export async function getUnreadCountAction(): Promise<number> {
  const user = await requireUser();
  return unreadCount({ workspaceId: user.workspaceId, userId: user.id });
}

/** Mark the caller's notifications read (specific ids, or all unread). */
export async function markNotificationsReadAction(
  ids?: string[],
): Promise<{ ok: true }> {
  const user = await requireUser();
  await markNotificationsRead({
    workspaceId: user.workspaceId,
    userId: user.id,
    ids,
  });
  revalidatePath("/town-hall");
  return { ok: true };
}

export type ExtractedSuggestion = {
  title: string;
  description?: string;
  /** Resolved assignee user id (null if no confident match). */
  assigneeUserId: string | null;
  assigneeName: string | null;
  /** Resolved project id for the reference (null if none). */
  projectId: string | null;
  projectTitle: string | null;
  priority: "now" | "next" | "later" | "backlog" | null;
};

export type ExtractActionItemsResult =
  | { ok: true; suggestions: ExtractedSuggestion[] }
  | { ok: false; error: string };

/**
 * Paste meeting notes → AI extraction. Resolves the AI's name/project
 * suggestions to concrete ids so the confirm step can pre-select them.
 * Commits NOTHING — returns suggestions for review.
 */
export async function extractActionItemsAction(
  notes: string,
): Promise<ExtractActionItemsResult> {
  const user = await requireUser();
  if (!notes || notes.trim().length < 4) {
    return { ok: false, error: "Paste some notes first." };
  }

  const [members, projects] = await Promise.all([
    listWorkspaceMembers(user.workspaceId),
    listProjectsForPicker(user.workspaceId),
  ]);

  const result = await extractActionItems({
    notes,
    memberNames: members.map((m) => m.displayName),
    projectTitles: projects.map((p) => p.title),
  });
  if (!result.ok) return { ok: false, error: result.error };

  const memberByName = new Map(
    members.map((m) => [m.displayName.toLowerCase(), m]),
  );
  const projectByTitle = new Map(
    projects.map((p) => [p.title.toLowerCase(), p]),
  );

  const suggestions: ExtractedSuggestion[] = result.items.map((it) => {
    const member = it.suggestedAssigneeName
      ? memberByName.get(it.suggestedAssigneeName.toLowerCase())
      : undefined;
    const project = it.suggestedRef
      ? projectByTitle.get(it.suggestedRef.toLowerCase())
      : undefined;
    return {
      title: it.title,
      description: it.description,
      assigneeUserId: member?.userId ?? null,
      assigneeName: member?.displayName ?? null,
      projectId: project?.id ?? null,
      projectTitle: project?.title ?? null,
      priority: it.priority ?? null,
    };
  });

  return { ok: true, suggestions };
}

const commitItemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  assigneeUserId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  priority: z.enum(["now", "next", "later", "backlog"]).nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

export type CommitActionItemsResult =
  | { ok: true; created: number }
  | { ok: false; error: string };

/**
 * Confirmed suggestions → real action items. Validates each row's project +
 * assignee against the caller's workspace before inserting.
 */
export async function commitActionItemsAction(
  items: Array<{
    title: string;
    description?: string;
    assigneeUserId?: string | null;
    projectId?: string | null;
    priority?: "now" | "next" | "later" | "backlog" | null;
    dueDate?: string | null;
  }>,
): Promise<CommitActionItemsResult> {
  const user = await requireUser();
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Nothing to commit." };
  }

  const members = await listWorkspaceMembers(user.workspaceId);
  const memberIds = new Set(members.map((m) => m.userId));

  let created = 0;
  for (const raw of items) {
    const parsed = commitItemSchema.safeParse(raw);
    if (!parsed.success) continue;
    const { title, description, assigneeUserId, projectId, priority, dueDate } =
      parsed.data;

    // Fence project + assignee to the workspace; drop the link if invalid.
    let safeProjectId: string | null = null;
    if (projectId) {
      const ok = await projectExistsInWorkspace(user.workspaceId, projectId);
      if (ok) safeProjectId = projectId;
    }
    const safeAssignee =
      assigneeUserId && memberIds.has(assigneeUserId) ? assigneeUserId : null;

    await createActionItem({
      workspaceId: user.workspaceId,
      actorId: user.id,
      title,
      description: description ?? null,
      assigneeUserId: safeAssignee,
      dueDate: dueDate ?? null,
      priority: priority ?? null,
      projectId: safeProjectId,
    });
    created += 1;
  }

  revalidatePath("/town-hall");
  revalidatePath("/action-items");
  return { ok: true, created };
}
