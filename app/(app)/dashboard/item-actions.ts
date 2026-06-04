"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/current-user";
import {
  createActionItem,
  updateActionItem,
  createTask,
  updateTask,
  addItemAttachment,
  removeItemAttachment,
  getItemDetail,
  type ItemDetail,
  type ItemEntityType,
  type WorkPriority,
} from "@/db/queries/items";
import { listWorkspaceMembers } from "@/db/queries/team";
import { createPostAction } from "@/app/(app)/town-hall/actions";

type Result = { ok: true; id: string } | { ok: false; error: string };

function refresh() {
  revalidatePath("/");
  revalidatePath("/work");
}

/* ── action items ─────────────────────────────────────────────────────── */

export async function createActionItemAction(opts: {
  title: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: WorkPriority | null;
  projectId?: string | null;
  contactId?: string | null;
  assigneeUserId?: string | null;
}): Promise<Result> {
  const user = await requireUser();
  if (!opts.title.trim()) return { ok: false, error: "Give it a title." };
  const { id } = await createActionItem({
    workspaceId: user.workspaceId,
    actorId: user.id,
    title: opts.title.trim(),
    description: opts.description,
    dueDate: opts.dueDate,
    priority: opts.priority,
    projectId: opts.projectId,
    contactId: opts.contactId,
    assigneeUserId: opts.assigneeUserId,
  });
  refresh();
  return { ok: true, id };
}

export async function updateActionItemAction(opts: {
  id: string;
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: WorkPriority | null;
  status?: "open" | "done";
  projectId?: string | null;
  contactId?: string | null;
  assigneeUserId?: string | null;
}): Promise<Result> {
  const user = await requireUser();
  const ok = await updateActionItem({ workspaceId: user.workspaceId, ...opts });
  if (!ok) return { ok: false, error: "Action item not found" };
  refresh();
  return { ok: true, id: opts.id };
}

/* ── tasks (milestones) ───────────────────────────────────────────────── */

export async function createTaskAction(opts: {
  title: string;
  projectId: string;
  dueDate?: string | null;
  priority?: WorkPriority | null;
  assigneeUserId?: string | null;
  initiativeId?: string | null;
}): Promise<Result> {
  const user = await requireUser();
  if (!opts.title.trim()) return { ok: false, error: "Give it a title." };
  if (!opts.projectId) return { ok: false, error: "Pick a project for the task." };
  const { id } = await createTask({
    workspaceId: user.workspaceId,
    actorId: user.id,
    title: opts.title.trim(),
    projectId: opts.projectId,
    dueDate: opts.dueDate,
    priority: opts.priority,
    assigneeUserId: opts.assigneeUserId,
    initiativeId: opts.initiativeId,
  });
  refresh();
  return { ok: true, id };
}

export async function updateTaskAction(opts: {
  id: string;
  title?: string;
  dueDate?: string | null;
  priority?: WorkPriority | null;
  status?: "pending" | "in_progress" | "in_review" | "blocked" | "done" | "cancelled";
  projectId?: string;
  assigneeUserId?: string | null;
  initiativeId?: string | null;
}): Promise<Result> {
  const user = await requireUser();
  const ok = await updateTask({ workspaceId: user.workspaceId, ...opts });
  if (!ok) return { ok: false, error: "Task not found" };
  refresh();
  return { ok: true, id: opts.id };
}

/* ── attachments ──────────────────────────────────────────────────────── */

export async function addAttachmentAction(opts: {
  entityType: ItemEntityType;
  entityId: string;
  label: string;
  url?: string | null;
  projectLinkId?: string | null;
}): Promise<Result> {
  const user = await requireUser();
  if (!opts.label.trim()) return { ok: false, error: "Give the attachment a label." };
  if (!opts.url && !opts.projectLinkId) {
    return { ok: false, error: "Provide a URL or pick a project doc." };
  }
  const { id } = await addItemAttachment({
    workspaceId: user.workspaceId,
    actorId: user.id,
    entityType: opts.entityType,
    entityId: opts.entityId,
    label: opts.label.trim(),
    url: opts.url ?? null,
    projectLinkId: opts.projectLinkId ?? null,
  });
  refresh();
  return { ok: true, id };
}

export async function removeAttachmentAction(opts: { id: string }): Promise<Result> {
  const user = await requireUser();
  const ok = await removeItemAttachment(user.workspaceId, opts.id);
  if (!ok) return { ok: false, error: "Attachment not found" };
  refresh();
  return { ok: true, id: opts.id };
}

/* ── tag teammates on Town Hall ───────────────────────────────────────── */

/**
 * @mention teammates about this action item / task — posts to the Town Hall
 * feed with the item attached as a #reference, which notifies them in-app +
 * via WhatsApp (reuses the Town Hall post pipeline).
 */
export async function mentionItemAction(opts: {
  entityType: ItemEntityType;
  entityId: string;
  label: string;
  mentionUserIds: string[];
  message?: string;
}): Promise<Result> {
  const user = await requireUser();
  if (!opts.mentionUserIds.length) {
    return { ok: false, error: "Pick at least one teammate to tag." };
  }
  const members = await listWorkspaceMembers(user.workspaceId);
  const nameById = new Map(members.map((m) => [m.userId, m.displayName]));
  const handles = opts.mentionUserIds
    .map((id) => nameById.get(id))
    .filter((n): n is string => Boolean(n))
    .map((n) => `@${n.toLowerCase().replace(/\s+/g, "")}`);

  // #label goes last so the ref token doesn't swallow trailing text.
  const body = [handles.join(" "), opts.message?.trim(), `re: #${opts.label}`]
    .filter(Boolean)
    .join(" ");

  const res = await createPostAction({
    body,
    mentionUserIds: opts.mentionUserIds,
    refs: [{ refType: opts.entityType, refId: opts.entityId, label: opts.label }],
  });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/town-hall");
  return { ok: true, id: res.postId };
}

/* ── detail loader (used by the drawer) ───────────────────────────────── */

export async function getItemDetailAction(opts: {
  entityType: ItemEntityType;
  id: string;
}): Promise<{ ok: true; detail: ItemDetail } | { ok: false; error: string }> {
  const user = await requireUser();
  const detail = await getItemDetail(user.workspaceId, opts.entityType, opts.id);
  if (!detail) return { ok: false, error: "Not found" };
  return { ok: true, detail };
}
