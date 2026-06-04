import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

export type ItemEntityType = "action_item" | "milestone" | "meeting";
export type WorkPriority = "now" | "next" | "later" | "backlog";

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
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(schema.actionItems)
    .values({
      workspaceId: input.workspaceId,
      title: input.title,
      description: input.description ?? null,
      dueDate: input.dueDate ?? null,
      priority: input.priority ?? null,
      projectId: input.projectId ?? null,
      contactId: input.contactId ?? null,
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
}): Promise<boolean> {
  const patch: Partial<typeof schema.actionItems.$inferInsert> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.projectId !== undefined) patch.projectId = input.projectId;
  if (input.contactId !== undefined) patch.contactId = input.contactId;
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
    .returning({ id: schema.actionItems.id });
  return rows.length > 0;
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
  const [row] = await db
    .insert(schema.milestones)
    .values({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      title: input.title,
      dueDate: input.dueDate ?? null,
      priority: input.priority ?? null,
      assigneeUserId: input.assigneeUserId ?? null,
      initiativeId: input.initiativeId ?? null,
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
}): Promise<boolean> {
  const patch: Partial<typeof schema.milestones.$inferInsert> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.projectId !== undefined) patch.projectId = input.projectId;
  if (input.assigneeUserId !== undefined) patch.assigneeUserId = input.assigneeUserId;
  if (input.initiativeId !== undefined) patch.initiativeId = input.initiativeId;
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
    .returning({ id: schema.milestones.id });
  return rows.length > 0;
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

export async function listProjectsForPicker(
  workspaceId: string,
): Promise<{ id: string; title: string }[]> {
  return db
    .select({ id: schema.projects.id, title: schema.projects.title })
    .from(schema.projects)
    .where(eq(schema.projects.workspaceId, workspaceId))
    .orderBy(asc(schema.projects.title));
}

/* ── unified detail ───────────────────────────────────────────────────── */

async function projectDocsFor(projectId: string | null): Promise<ProjectDocRef[]> {
  if (!projectId) return [];
  const rows = await db
    .select({
      id: schema.projectLinks.id,
      label: schema.projectLinks.label,
      kind: schema.projectLinks.kind,
      url: schema.projectLinks.url,
    })
    .from(schema.projectLinks)
    .where(eq(schema.projectLinks.projectId, projectId))
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
        contactId: schema.actionItems.contactId,
        contactName: schema.contacts.name,
      })
      .from(schema.actionItems)
      .leftJoin(schema.projects, eq(schema.projects.id, schema.actionItems.projectId))
      .leftJoin(schema.contacts, eq(schema.contacts.id, schema.actionItems.contactId))
      .where(and(eq(schema.actionItems.id, id), eq(schema.actionItems.workspaceId, workspaceId)))
      .limit(1);
    if (!row) return null;
    const [projectDocs, attachments] = await Promise.all([
      projectDocsFor(row.projectId),
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
      projectDocsFor(row.projectId),
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
    })
    .from(schema.meetings)
    .leftJoin(schema.projects, eq(schema.projects.id, schema.meetings.linkedProjectId))
    .where(and(eq(schema.meetings.id, id), eq(schema.meetings.workspaceId, workspaceId)))
    .limit(1);
  if (!row) return null;
  const [projectDocs, attachments, generated, attendeeRows] = await Promise.all([
    projectDocsFor(row.projectId),
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
