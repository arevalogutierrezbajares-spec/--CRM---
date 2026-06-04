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
import { listWorkspaceMembers, findMembers, getMemberPhones } from "@/db/queries/team";
import { createPostAction } from "@/app/(app)/town-hall/actions";
import { findProjectByName } from "@/db/queries/items";
import { notifyUsers } from "@/db/queries/town-hall";
import { parseCapture } from "@/lib/nlp/parse-capture";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { todayInTz, addDaysToISODate } from "@/lib/date/today";

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

/**
 * Snooze / defer an action item — push its due date forward by N days from
 * today (clears the "overdue" state and gets it out of "Needs you now" until
 * it matters again). Default: tomorrow.
 */
export async function snoozeActionItemAction(opts: {
  id: string;
  days?: number;
}): Promise<Result> {
  const user = await requireUser();
  const days = Math.max(1, Math.min(opts.days ?? 1, 90));
  // Anchor on "today" in the user's timezone — the same basis the overdue/
  // "today" logic now uses — so a snoozed item reliably clears overdue (and
  // "snooze to tomorrow" lands on the user's tomorrow, not UTC's).
  const dueDate = addDaysToISODate(todayInTz(user.timezone), days);
  const ok = await updateActionItem({ workspaceId: user.workspaceId, id: opts.id, dueDate });
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
  let id: string;
  try {
    ({ id } = await createTask({
      workspaceId: user.workspaceId,
      actorId: user.id,
      title: opts.title.trim(),
      projectId: opts.projectId,
      dueDate: opts.dueDate,
      priority: opts.priority,
      assigneeUserId: opts.assigneeUserId,
      initiativeId: opts.initiativeId,
    }));
  } catch {
    return { ok: false, error: "That project isn't in your workspace." };
  }
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
  // The target item must exist in this workspace (entityId has no FK).
  const target = await getItemDetail(user.workspaceId, opts.entityType, opts.entityId);
  if (!target) return { ok: false, error: "Item not found." };
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

/* ── natural-language quick capture ───────────────────────────────────── */

/**
 * Create an action item from free text — "call Ana tomorrow 3pm @ana #acme
 * urgent" → title + due date (chrono) + assignee (@) + project (#) + priority.
 */
export async function quickCaptureAction(opts: {
  text: string;
}): Promise<{ ok: true; id: string; summary: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = parseCapture(opts.text);
  if (!parsed.title.trim()) return { ok: false, error: "Nothing to capture." };

  let assigneeUserId: string | null = null;
  if (parsed.assigneeName) {
    const m = await findMembers({ workspaceId: user.workspaceId, query: parsed.assigneeName, limit: 1 });
    assigneeUserId = m[0]?.userId ?? null;
  }
  const projectId = parsed.projectName
    ? await findProjectByName(user.workspaceId, parsed.projectName)
    : null;

  const { id } = await createActionItem({
    workspaceId: user.workspaceId,
    actorId: user.id,
    title: parsed.title,
    dueDate: parsed.dueDate,
    priority: parsed.priority,
    assigneeUserId,
    projectId,
  });
  refresh();
  const bits = [
    parsed.dueDate && `due ${parsed.dueDate}`,
    assigneeUserId && parsed.assigneeName && `@${parsed.assigneeName}`,
    projectId && parsed.projectName && `#${parsed.projectName}`,
  ].filter(Boolean);
  return { ok: true, id, summary: bits.length ? `Added — ${bits.join(", ")}` : "Added" };
}

/* ── structured capture + notify (keyboard combobox) ──────────────────── */

/**
 * Capture from the mention combobox: assignee/mentions/project are already
 * resolved to ids (picks), so we only parse the raw text for a due date +
 * priority. Creates the item then notifies the assignee + @mentioned teammates
 * (and you, if you chose yourself) with a notification that deep-links to it.
 */
export async function captureItemAction(opts: {
  rawText: string;
  itemKind: "action_item" | "task";
  projectId?: string | null;
  assigneeUserId?: string | null;
  mentionUserIds?: string[];
  /** @document picks — attached to the new item (label + project_links id). */
  docRefs?: { linkId: string; label: string }[];
  /** @all — broadcast a notification to every teammate. */
  notifyAll?: boolean;
}): Promise<
  { ok: true; id: string; summary: string; notified: number } | { ok: false; error: string }
> {
  const user = await requireUser();
  const parsed = parseCapture(opts.rawText);
  if (!parsed.title.trim()) return { ok: false, error: "Nothing to capture." };

  // Fall back to resolving any hand-typed @name / #project that wasn't picked.
  let assigneeUserId = opts.assigneeUserId ?? null;
  if (!assigneeUserId && parsed.assigneeName) {
    const m = await findMembers({ workspaceId: user.workspaceId, query: parsed.assigneeName, limit: 1 });
    assigneeUserId = m[0]?.userId ?? null;
  }
  let projectId = opts.projectId ?? null;
  if (!projectId && parsed.projectName) {
    projectId = await findProjectByName(user.workspaceId, parsed.projectName);
  }

  const title = parsed.title;
  let id: string;
  if (opts.itemKind === "task") {
    if (!projectId) return { ok: false, error: "Pick a project for the task (#project)." };
    try {
      ({ id } = await createTask({
        workspaceId: user.workspaceId,
        actorId: user.id,
        title,
        projectId,
        dueDate: parsed.dueDate,
        priority: parsed.priority,
        assigneeUserId,
      }));
    } catch {
      return { ok: false, error: "That project isn't in your workspace." };
    }
  } else {
    ({ id } = await createActionItem({
      workspaceId: user.workspaceId,
      actorId: user.id,
      title,
      dueDate: parsed.dueDate,
      priority: parsed.priority,
      assigneeUserId,
      projectId,
    }));
  }

  const entityType: ItemEntityType = opts.itemKind === "task" ? "milestone" : "action_item";

  // Attach any @document picks to the new item.
  for (const d of opts.docRefs ?? []) {
    await addItemAttachment({
      workspaceId: user.workspaceId,
      actorId: user.id,
      entityType,
      entityId: id,
      label: d.label.slice(0, 200),
      projectLinkId: d.linkId,
    }).catch(() => {}); // best-effort; a bad link id shouldn't fail the capture
  }

  const mentions = Array.from(new Set(opts.mentionUserIds ?? []));
  let notified = 0;
  if (assigneeUserId) {
    notified += await notifyUsers({
      workspaceId: user.workspaceId,
      actorId: user.id,
      recipientUserIds: [assigneeUserId],
      entityType,
      entityId: id,
      title,
      kind: "assigned",
      includeActor: true, // deliberate pick → notify even if it's you
    });
  }
  const toMention = mentions.filter((u) => u !== assigneeUserId);
  if (toMention.length > 0) {
    notified += await notifyUsers({
      workspaceId: user.workspaceId,
      actorId: user.id,
      recipientUserIds: toMention,
      entityType,
      entityId: id,
      title,
      kind: "mention",
      includeActor: true,
    });
  }
  // @all — broadcast to every teammate not already notified (items are already
  // workspace-visible; this actively alerts the whole team).
  if (opts.notifyAll) {
    const already = new Set([assigneeUserId, ...toMention].filter(Boolean) as string[]);
    const everyone = (await listWorkspaceMembers(user.workspaceId)).map((m) => m.userId).filter((uid) => !already.has(uid));
    notified += await notifyUsers({
      workspaceId: user.workspaceId,
      actorId: user.id,
      recipientUserIds: everyone,
      entityType,
      entityId: id,
      title,
      kind: "mention",
      includeActor: false, // you're broadcasting; no self-notification
    });
  }
  refresh();
  const bits = [parsed.dueDate && `due ${parsed.dueDate}`, notified > 0 && `notified ${notified}`].filter(Boolean);
  return { ok: true, id, summary: bits.length ? `Added — ${bits.join(", ")}` : "Added", notified };
}

/* ── re-notify / remind ───────────────────────────────────────────────── */

/** Re-notify (ping) people about an item — re-adds it to their bell + optional WhatsApp. */
export async function pingItemAction(opts: {
  entityType: ItemEntityType;
  entityId: string;
  userIds: string[];
  alsoWhatsApp?: boolean;
}): Promise<{ ok: true; notified: number } | { ok: false; error: string }> {
  const user = await requireUser();
  const detail = await getItemDetail(user.workspaceId, opts.entityType, opts.entityId);
  if (!detail) return { ok: false, error: "Item not found." };
  const recipients = Array.from(new Set(opts.userIds)).filter(Boolean);
  if (recipients.length === 0) return { ok: false, error: "Pick at least one person to ping." };
  const notified = await notifyUsers({
    workspaceId: user.workspaceId,
    actorId: user.id,
    recipientUserIds: recipients,
    entityType: opts.entityType,
    entityId: opts.entityId,
    title: detail.title,
    kind: "ping",
    includeActor: true,
    dedupe: true,
  });
  if (opts.alsoWhatsApp) {
    const phones = await getMemberPhones(user.workspaceId, recipients);
    const link = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/?item=${opts.entityType}:${opts.entityId}`;
    await Promise.all(
      phones.map((p) =>
        sendWhatsAppText({ to: p.phone, body: `${user.displayName} pinged you: "${detail.title}" → ${link}` }),
      ),
    );
  }
  refresh();
  return { ok: true, notified };
}

/** Remind myself about an item — a self-notification in my bell. */
export async function remindMeAction(opts: {
  entityType: ItemEntityType;
  entityId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const detail = await getItemDetail(user.workspaceId, opts.entityType, opts.entityId);
  if (!detail) return { ok: false, error: "Item not found." };
  await notifyUsers({
    workspaceId: user.workspaceId,
    actorId: user.id,
    recipientUserIds: [user.id],
    entityType: opts.entityType,
    entityId: opts.entityId,
    title: detail.title,
    kind: "reminder",
    includeActor: true,
    dedupe: true,
  });
  refresh();
  return { ok: true };
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

  // Clamp the label so a very long title can't blow the 200-char post-ref limit
  // (which would reject the whole post). #label goes last so the ref token
  // doesn't swallow trailing text.
  const label = opts.label.trim().slice(0, 120) || "item";
  const body = [handles.join(" "), opts.message?.trim(), `re: #${label}`]
    .filter(Boolean)
    .join(" ");

  const res = await createPostAction({
    body,
    mentionUserIds: opts.mentionUserIds,
    refs: [{ refType: opts.entityType, refId: opts.entityId, label }],
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
