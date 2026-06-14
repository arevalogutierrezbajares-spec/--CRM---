import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

export type ItemEntityType = "action_item" | "milestone" | "meeting";
export type WorkPriority = "now" | "next" | "later" | "backlog";

/**
 * Workspace-wide document index. RefObject-shaped (for the @document
 * autocomplete) plus projectId/projectTitle/category/kind for the sidebar
 * Explorer (group by project → section, filter).
 */
export type WorkspaceDoc = {
  refType: "doc";
  refId: string;
  label: string;
  href: string;
  external: boolean;
  kind: string;
  category: string;
  projectId: string;
  projectTitle: string;
};

/** React cache(): the doc index feeds Home mention sources + the sidebar
 *  Explorer — dedupe to one query per request. */
export const listWorkspaceDocs = cache(async (workspaceId: string, limit = 300): Promise<WorkspaceDoc[]> => {
  const rows = await db
    .select({
      id: schema.projectLinks.id,
      label: schema.projectLinks.label,
      kind: schema.projectLinks.kind,
      category: schema.projectLinks.category,
      url: schema.projectLinks.url,
      projectId: schema.projectLinks.lobId,
      projectTitle: schema.linesOfBusiness.title,
    })
    .from(schema.projectLinks)
    .innerJoin(
      schema.linesOfBusiness,
      eq(schema.linesOfBusiness.id, schema.projectLinks.lobId),
    )
    .where(eq(schema.linesOfBusiness.workspaceId, workspaceId))
    .orderBy(asc(schema.linesOfBusiness.title), asc(schema.projectLinks.label))
    .limit(limit);
  return rows.map((r) => {
    const external = r.kind === "link" && Boolean(r.url);
    return {
      refType: "doc" as const,
      refId: r.id,
      label: r.label,
      kind: r.kind,
      category: r.category,
      projectId: r.projectId,
      projectTitle: r.projectTitle,
      external,
      href:
        r.kind === "doc"
          ? `/lob/${r.projectId}/docs/${r.id}`
          : external
            ? (r.url as string)
            : `/lob/${r.projectId}`,
    };
  });
});

export type ItemAttachment = {
  id: string;
  label: string;
  url: string | null;
  projectLinkId: string | null;
  kind: string | null; // 'doc' | 'file' | 'link' | 'note' when it references a project_link
};

export type RelatedItem = {
  entityType: ItemEntityType;
  id: string;
  title: string;
  status: string | null;
};

export type ProjectDocRef = { id: string; label: string; kind: string; url: string | null };

export type ItemDetail = {
  entityType: ItemEntityType;
  id: string;
  title: string;
  status: string | null;
  description: string | null;
  dueDate: string | null;
  scheduledAt: Date | null;
  priority: WorkPriority | null;
  fromVoice: boolean;
  // "part of"
  projectId: string | null;
  projectTitle: string | null;
  initiativeId: string | null;
  initiativeTitle: string | null;
  sprintId: string | null;
  sprintName: string | null;
  contactId: string | null;
  contactName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  sourceMeetingId: string | null;
  attendees: string[];
  // related
  projectDocs: ProjectDocRef[];
  attachments: ItemAttachment[];
  relatedItems: RelatedItem[];
};

/* ── workspace-scope guards for foreign-key writes ────────────────────────
 * Defense for BOTH the web actions and the WhatsApp tools: never persist an
 * assignee / project / contact / initiative that belongs to another workspace
 * (the row's own workspace is fenced separately by the WHERE clause). A foreign
 * value is dropped to null rather than written. */

async function memberOrNull(workspaceId: string, userId?: string | null): Promise<string | null> {
  if (!userId) return null;
  const [r] = await db
    .select({ id: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, workspaceId),
        eq(schema.workspaceMembers.userId, userId),
      ),
    )
    .limit(1);
  return r ? userId : null;
}

async function contactOrNull(workspaceId: string, contactId?: string | null): Promise<string | null> {
  if (!contactId) return null;
  const [r] = await db
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(and(eq(schema.contacts.id, contactId), eq(schema.contacts.workspaceId, workspaceId)))
    .limit(1);
  return r ? contactId : null;
}

async function initiativeOrNull(workspaceId: string, initiativeId?: string | null): Promise<string | null> {
  if (!initiativeId) return null;
  const [r] = await db
    .select({ id: schema.initiatives.id })
    .from(schema.initiatives)
    .where(and(eq(schema.initiatives.id, initiativeId), eq(schema.initiatives.workspaceId, workspaceId)))
    .limit(1);
  return r ? initiativeId : null;
}

async function projectOrNull(workspaceId: string, projectId?: string | null): Promise<string | null> {
  if (!projectId) return null;
  return (await projectExistsInWorkspace(workspaceId, projectId)) ? projectId : null;
}

/* ── create / update ──────────────────────────────────────────────────── */

export async function createActionItem(input: {
  workspaceId: string;
  actorId: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: WorkPriority | null;
  projectId?: string | null;
  contactId?: string | null;
  assigneeUserId?: string | null;
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(schema.actionItems)
    .values({
      workspaceId: input.workspaceId,
      title: input.title,
      description: input.description ?? null,
      dueDate: input.dueDate ?? null,
      priority: input.priority ?? null,
      projectId: await projectOrNull(input.workspaceId, input.projectId),
      contactId: await contactOrNull(input.workspaceId, input.contactId),
      assigneeUserId: await memberOrNull(input.workspaceId, input.assigneeUserId),
      createdBy: input.actorId,
    })
    .returning({ id: schema.actionItems.id });
  return { id: row.id };
}

export async function updateActionItem(input: {
  workspaceId: string;
  id: string;
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: WorkPriority | null;
  status?: "open" | "done";
  projectId?: string | null;
  contactId?: string | null;
  assigneeUserId?: string | null;
}): Promise<{ id: string; title: string } | null> {
  const patch: Partial<typeof schema.actionItems.$inferInsert> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
  if (input.priority !== undefined) patch.priority = input.priority;
  // Workspace-fence foreign keys before writing (covers WA tools + web).
  if (input.projectId !== undefined) patch.projectId = await projectOrNull(input.workspaceId, input.projectId);
  if (input.contactId !== undefined) patch.contactId = await contactOrNull(input.workspaceId, input.contactId);
  if (input.assigneeUserId !== undefined) patch.assigneeUserId = await memberOrNull(input.workspaceId, input.assigneeUserId);
  if (input.status !== undefined) {
    patch.status = input.status;
    patch.completedAt = input.status === "done" ? new Date() : null;
  }
  const rows = await db
    .update(schema.actionItems)
    .set(patch)
    .where(
      and(eq(schema.actionItems.id, input.id), eq(schema.actionItems.workspaceId, input.workspaceId)),
    )
    .returning({ id: schema.actionItems.id, title: schema.actionItems.title });
  return rows[0] ?? null;
}

export async function createTask(input: {
  workspaceId: string;
  actorId: string;
  title: string;
  projectId: string; // milestones require a project
  dueDate?: string | null;
  priority?: WorkPriority | null;
  assigneeUserId?: string | null;
  initiativeId?: string | null;
}): Promise<{ id: string }> {
  // A task must belong to a project in THIS workspace.
  if (!(await projectExistsInWorkspace(input.workspaceId, input.projectId))) {
    throw new Error("Project not found in workspace");
  }
  const [row] = await db
    .insert(schema.milestones)
    .values({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      title: input.title,
      dueDate: input.dueDate ?? null,
      priority: input.priority ?? null,
      assigneeUserId: await memberOrNull(input.workspaceId, input.assigneeUserId),
      initiativeId: await initiativeOrNull(input.workspaceId, input.initiativeId),
      createdBy: input.actorId,
    })
    .returning({ id: schema.milestones.id });
  return { id: row.id };
}

export async function updateTask(input: {
  workspaceId: string;
  id: string;
  title?: string;
  dueDate?: string | null;
  priority?: WorkPriority | null;
  status?: "pending" | "in_progress" | "in_review" | "blocked" | "done" | "cancelled";
  projectId?: string;
  assigneeUserId?: string | null;
  initiativeId?: string | null;
}): Promise<{ id: string; title: string } | null> {
  const patch: Partial<typeof schema.milestones.$inferInsert> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
  if (input.priority !== undefined) patch.priority = input.priority;
  // Moving project: only to a project in this workspace (ignore otherwise — a
  // task must always have a valid project).
  if (input.projectId !== undefined) {
    const ok = await projectOrNull(input.workspaceId, input.projectId);
    if (ok) patch.projectId = ok;
  }
  if (input.assigneeUserId !== undefined) patch.assigneeUserId = await memberOrNull(input.workspaceId, input.assigneeUserId);
  if (input.initiativeId !== undefined) patch.initiativeId = await initiativeOrNull(input.workspaceId, input.initiativeId);
  if (input.status !== undefined) {
    patch.status = input.status;
    patch.completedAt = input.status === "done" ? new Date() : null;
  }
  const rows = await db
    .update(schema.milestones)
    .set(patch)
    .where(
      and(eq(schema.milestones.id, input.id), eq(schema.milestones.workspaceId, input.workspaceId)),
    )
    .returning({ id: schema.milestones.id, title: schema.milestones.title });
  return rows[0] ?? null;
}

/* ── attachments ──────────────────────────────────────────────────────── */

export async function listItemAttachments(
  workspaceId: string,
  entityType: ItemEntityType,
  entityId: string,
): Promise<ItemAttachment[]> {
  const rows = await db
    .select({
      id: schema.itemAttachments.id,
      label: schema.itemAttachments.label,
      url: schema.itemAttachments.url,
      projectLinkId: schema.itemAttachments.projectLinkId,
      kind: schema.projectLinks.kind,
    })
    .from(schema.itemAttachments)
    .leftJoin(schema.projectLinks, eq(schema.projectLinks.id, schema.itemAttachments.projectLinkId))
    .where(
      and(
        eq(schema.itemAttachments.workspaceId, workspaceId),
        eq(schema.itemAttachments.entityType, entityType),
        eq(schema.itemAttachments.entityId, entityId),
      ),
    )
    .orderBy(desc(schema.itemAttachments.createdAt));
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    url: r.url,
    projectLinkId: r.projectLinkId,
    kind: r.kind ?? null,
  }));
}

export async function addItemAttachment(input: {
  workspaceId: string;
  actorId: string;
  entityType: ItemEntityType;
  entityId: string;
  label: string;
  url?: string | null;
  projectLinkId?: string | null;
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(schema.itemAttachments)
    .values({
      workspaceId: input.workspaceId,
      entityType: input.entityType,
      entityId: input.entityId,
      label: input.label,
      url: input.url ?? null,
      projectLinkId: input.projectLinkId ?? null,
      createdBy: input.actorId,
    })
    .returning({ id: schema.itemAttachments.id });
  return { id: row.id };
}

export async function removeItemAttachment(workspaceId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(schema.itemAttachments)
    .where(and(eq(schema.itemAttachments.id, id), eq(schema.itemAttachments.workspaceId, workspaceId)))
    .returning({ id: schema.itemAttachments.id });
  return rows.length > 0;
}

/* ── pickers ──────────────────────────────────────────────────────────── */

/** React cache(): pickers/mention sources ask for this several times per
 *  request — dedupe to one query. */
export const listProjectsForPicker = cache(
  async (workspaceId: string): Promise<{ id: string; title: string }[]> => {
    return db
      .select({ id: schema.projects.id, title: schema.projects.title })
      .from(schema.projects)
      .where(eq(schema.projects.workspaceId, workspaceId))
      .orderBy(asc(schema.projects.title));
  },
);

/** Whether a project id belongs to the workspace (validates #refs / picks). */
export async function projectExistsInWorkspace(
  workspaceId: string,
  projectId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(eq(schema.projects.id, projectId), eq(schema.projects.workspaceId, workspaceId)),
    )
    .limit(1);
  return Boolean(row);
}

/* ── fuzzy lookups (used by the WhatsApp agent to resolve a target) ────── */

export type ItemMatch = { id: string; title: string };
export type MilestoneMatch = ItemMatch & {
  projectId: string;
  projectTitle: string;
  status: string;
};

/** Open action items, newest first; narrowed by title when `query` is given. */
export async function findActionItems(opts: {
  workspaceId: string;
  query?: string;
  limit?: number;
}): Promise<ItemMatch[]> {
  const conds = [
    eq(schema.actionItems.workspaceId, opts.workspaceId),
    eq(schema.actionItems.status, "open"),
  ];
  const q = opts.query?.trim();
  if (q) conds.push(ilike(schema.actionItems.title, `%${q}%`));
  return db
    .select({ id: schema.actionItems.id, title: schema.actionItems.title })
    .from(schema.actionItems)
    .where(and(...conds))
    .orderBy(desc(schema.actionItems.createdAt))
    .limit(opts.limit ?? 15);
}

export type OpenActionItem = {
  id: string;
  title: string;
  dueDate: string | null;
  priority: WorkPriority | null;
  projectId: string | null;
  createdAt: Date;
};

/**
 * Open action items for the workspace, newest first — the helper's checklist.
 * Richer than findActionItems (which is a title-only fuzzy lookup): carries due
 * date + priority + project so the macOS Town Hall can render the full row.
 */
export async function listOpenActionItems(opts: {
  workspaceId: string;
  limit?: number;
}): Promise<OpenActionItem[]> {
  return db
    .select({
      id: schema.actionItems.id,
      title: schema.actionItems.title,
      dueDate: schema.actionItems.dueDate,
      priority: schema.actionItems.priority,
      projectId: schema.actionItems.projectId,
      createdAt: schema.actionItems.createdAt,
    })
    .from(schema.actionItems)
    .where(
      and(
        eq(schema.actionItems.workspaceId, opts.workspaceId),
        eq(schema.actionItems.status, "open"),
      ),
    )
    .orderBy(desc(schema.actionItems.createdAt))
    .limit(opts.limit ?? 100);
}

/** Fuzzy-match a project by title within the workspace → id (for #refs / capture). */
export async function findProjectByName(
  workspaceId: string,
  name: string,
): Promise<string | null> {
  const q = name.trim();
  if (!q) return null;
  const [p] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.workspaceId, workspaceId), ilike(schema.projects.title, `%${q}%`)))
    .limit(1);
  return p?.id ?? null;
}

/** Open milestones (not done/cancelled) with their project, newest first. */
export async function findTasks(opts: {
  workspaceId: string;
  query?: string;
  limit?: number;
}): Promise<MilestoneMatch[]> {
  const conds = [
    eq(schema.milestones.workspaceId, opts.workspaceId),
    sql`${schema.milestones.status} not in ('done', 'cancelled')`,
  ];
  const q = opts.query?.trim();
  if (q) conds.push(ilike(schema.milestones.title, `%${q}%`));
  return db
    .select({
      id: schema.milestones.id,
      title: schema.milestones.title,
      projectId: schema.milestones.projectId,
      projectTitle: schema.projects.title,
      status: schema.milestones.status,
    })
    .from(schema.milestones)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.milestones.projectId))
    .where(and(...conds))
    .orderBy(desc(schema.milestones.createdAt))
    .limit(opts.limit ?? 15);
}

/* ── unified detail ───────────────────────────────────────────────────── */

// Docs/links live on the LoB; resolve them by the owning Line of Business.
async function projectDocsFor(lobId: string | null): Promise<ProjectDocRef[]> {
  if (!lobId) return [];
  const rows = await db
    .select({
      id: schema.projectLinks.id,
      label: schema.projectLinks.label,
      kind: schema.projectLinks.kind,
      url: schema.projectLinks.url,
    })
    .from(schema.projectLinks)
    .where(eq(schema.projectLinks.lobId, lobId))
    .orderBy(asc(schema.projectLinks.category), asc(schema.projectLinks.sortOrder));
  return rows.map((r) => ({ id: r.id, label: r.label, kind: r.kind, url: r.url }));
}

/** Load a complete PMO detail for any of the three entity types. */
export async function getItemDetail(
  workspaceId: string,
  entityType: ItemEntityType,
  id: string,
): Promise<ItemDetail | null> {
  const u = schema.users;
  const blank = {
    initiativeId: null as string | null,
    initiativeTitle: null as string | null,
    sprintId: null as string | null,
    sprintName: null as string | null,
    contactId: null as string | null,
    contactName: null as string | null,
    assigneeId: null as string | null,
    assigneeName: null as string | null,
    sourceMeetingId: null as string | null,
    scheduledAt: null as Date | null,
    attendees: [] as string[],
  };

  if (entityType === "action_item") {
    const [row] = await db
      .select({
        id: schema.actionItems.id,
        title: schema.actionItems.title,
        status: schema.actionItems.status,
        description: schema.actionItems.description,
        dueDate: schema.actionItems.dueDate,
        priority: schema.actionItems.priority,
        voiceNoteId: schema.actionItems.voiceNoteId,
        projectId: schema.actionItems.projectId,
        projectTitle: schema.projects.title,
        lobId: schema.projects.lobId,
        contactId: schema.actionItems.contactId,
        contactName: schema.contacts.name,
        assigneeId: schema.actionItems.assigneeUserId,
        assigneeName: u.displayName,
      })
      .from(schema.actionItems)
      .leftJoin(schema.projects, eq(schema.projects.id, schema.actionItems.projectId))
      .leftJoin(schema.contacts, eq(schema.contacts.id, schema.actionItems.contactId))
      .leftJoin(u, eq(u.id, schema.actionItems.assigneeUserId))
      .where(and(eq(schema.actionItems.id, id), eq(schema.actionItems.workspaceId, workspaceId)))
      .limit(1);
    if (!row) return null;
    const [projectDocs, attachments] = await Promise.all([
      projectDocsFor(row.lobId),
      listItemAttachments(workspaceId, entityType, id),
    ]);
    return {
      ...blank,
      entityType,
      id: row.id,
      title: row.title,
      status: row.status,
      description: row.description,
      dueDate: row.dueDate,
      priority: row.priority,
      fromVoice: Boolean(row.voiceNoteId),
      projectId: row.projectId,
      projectTitle: row.projectTitle,
      contactId: row.contactId,
      contactName: row.contactName,
      assigneeId: row.assigneeId,
      assigneeName: row.assigneeName,
      projectDocs,
      attachments,
      relatedItems: [],
    };
  }

  if (entityType === "milestone") {
    const [row] = await db
      .select({
        id: schema.milestones.id,
        title: schema.milestones.title,
        status: schema.milestones.status,
        blockerText: schema.milestones.blockerText,
        dueDate: schema.milestones.dueDate,
        priority: schema.milestones.priority,
        projectId: schema.milestones.projectId,
        projectTitle: schema.projects.title,
        lobId: schema.projects.lobId,
        initiativeId: schema.milestones.initiativeId,
        initiativeTitle: schema.initiatives.title,
        sprintId: schema.milestones.sprintId,
        sprintName: schema.sprints.name,
        assigneeId: schema.milestones.assigneeUserId,
        assigneeName: u.displayName,
        sourceMeetingId: schema.milestones.sourceMeetingId,
      })
      .from(schema.milestones)
      .leftJoin(schema.projects, eq(schema.projects.id, schema.milestones.projectId))
      .leftJoin(schema.initiatives, eq(schema.initiatives.id, schema.milestones.initiativeId))
      .leftJoin(schema.sprints, eq(schema.sprints.id, schema.milestones.sprintId))
      .leftJoin(u, eq(u.id, schema.milestones.assigneeUserId))
      .where(and(eq(schema.milestones.id, id), eq(schema.milestones.workspaceId, workspaceId)))
      .limit(1);
    if (!row) return null;
    const [projectDocs, attachments, subtasks] = await Promise.all([
      projectDocsFor(row.lobId),
      listItemAttachments(workspaceId, entityType, id),
      db
        .select({ id: schema.milestones.id, title: schema.milestones.title, status: schema.milestones.status })
        .from(schema.milestones)
        .where(
          and(
            eq(schema.milestones.parentMilestoneId, id),
            eq(schema.milestones.workspaceId, workspaceId),
          ),
        )
        .orderBy(asc(schema.milestones.order)),
    ]);
    return {
      ...blank,
      entityType,
      id: row.id,
      title: row.title,
      status: row.status,
      description: row.blockerText,
      dueDate: row.dueDate,
      priority: row.priority,
      fromVoice: false,
      projectId: row.projectId,
      projectTitle: row.projectTitle,
      initiativeId: row.initiativeId,
      initiativeTitle: row.initiativeTitle,
      sprintId: row.sprintId,
      sprintName: row.sprintName,
      assigneeId: row.assigneeId,
      assigneeName: row.assigneeName,
      sourceMeetingId: row.sourceMeetingId,
      projectDocs,
      attachments,
      relatedItems: subtasks.map((s) => ({
        entityType: "milestone" as const,
        id: s.id,
        title: s.title,
        status: s.status,
      })),
    };
  }

  // meeting
  const [row] = await db
    .select({
      id: schema.meetings.id,
      title: schema.meetings.title,
      agenda: schema.meetings.agenda,
      scheduledAt: schema.meetings.scheduledAt,
      endedAt: schema.meetings.endedAt,
      projectId: schema.meetings.linkedProjectId,
      projectTitle: schema.projects.title,
      lobId: schema.projects.lobId,
    })
    .from(schema.meetings)
    .leftJoin(schema.projects, eq(schema.projects.id, schema.meetings.linkedProjectId))
    .where(and(eq(schema.meetings.id, id), eq(schema.meetings.workspaceId, workspaceId)))
    .limit(1);
  if (!row) return null;
  const [projectDocs, attachments, generated, attendeeRows] = await Promise.all([
    projectDocsFor(row.lobId),
    listItemAttachments(workspaceId, entityType, id),
    db
      .select({ id: schema.milestones.id, title: schema.milestones.title, status: schema.milestones.status })
      .from(schema.milestones)
      .where(
        and(
          eq(schema.milestones.sourceMeetingId, id),
          eq(schema.milestones.workspaceId, workspaceId),
        ),
      ),
    db
      .select({ name: schema.contacts.name })
      .from(schema.meetingAttendees)
      .innerJoin(schema.contacts, eq(schema.contacts.id, schema.meetingAttendees.contactId))
      .where(eq(schema.meetingAttendees.meetingId, id)),
  ]);
  return {
    ...blank,
    entityType,
    id: row.id,
    title: row.title,
    status: row.endedAt ? "ended" : "scheduled",
    description: row.agenda,
    dueDate: null,
    priority: null,
    fromVoice: false,
    scheduledAt: row.scheduledAt,
    projectId: row.projectId,
    projectTitle: row.projectTitle,
    attendees: attendeeRows.map((a) => a.name),
    projectDocs,
    attachments,
    relatedItems: generated.map((s) => ({
      entityType: "milestone" as const,
      id: s.id,
      title: s.title,
      status: s.status,
    })),
  };
}
