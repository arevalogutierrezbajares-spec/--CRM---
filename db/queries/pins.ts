import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

export type PinnedDoc = {
  id: string;
  label: string;
  kind: string;
  url: string | null;
  filename: string | null;
  mime: string | null;
};
export type PinnedTask = { id: string; title: string; status: string; dueDate: string | null };
export type PinnedActionItem = { id: string; title: string };

export type PinnedProject = {
  id: string;
  title: string;
  status: string;
  progressPct: number;
  openTasks: number;
  totalTasks: number;
  health: "green" | "amber" | "red";
  nextMilestone: { id: string; title: string; dueDate: string | null } | null;
  docs: PinnedDoc[];
  tasks: PinnedTask[];
  actionItems: PinnedActionItem[];
};

/** A user's pinned projects, each with its docs/links + open tasks + open action items. */
export async function listPinnedProjects(
  workspaceId: string,
  userId: string,
): Promise<PinnedProject[]> {
  const pinned = await db
    .select({
      id: schema.projects.id,
      title: schema.projects.title,
      status: schema.projects.status,
    })
    .from(schema.projectPins)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.projectPins.projectId))
    .where(
      and(
        eq(schema.projectPins.userId, userId),
        eq(schema.projectPins.workspaceId, workspaceId),
      ),
    )
    .orderBy(desc(schema.projectPins.createdAt));

  if (pinned.length === 0) return [];
  const ids = pinned.map((p) => p.id);

  const [docs, tasks, actionItems, counts] = await Promise.all([
    db
      .select({
        projectId: schema.projectLinks.projectId,
        id: schema.projectLinks.id,
        label: schema.projectLinks.label,
        kind: schema.projectLinks.kind,
        url: schema.projectLinks.url,
        filename: schema.projectLinks.originalFilename,
        mime: schema.projectLinks.mimeType,
        sortOrder: schema.projectLinks.sortOrder,
      })
      .from(schema.projectLinks)
      .where(inArray(schema.projectLinks.projectId, ids))
      .orderBy(schema.projectLinks.sortOrder),
    db
      .select({
        projectId: schema.milestones.projectId,
        id: schema.milestones.id,
        title: schema.milestones.title,
        status: schema.milestones.status,
        dueDate: schema.milestones.dueDate,
      })
      .from(schema.milestones)
      .where(
        and(
          inArray(schema.milestones.projectId, ids),
          sql`${schema.milestones.status} not in ('done', 'cancelled')`,
        ),
      )
      .orderBy(schema.milestones.order),
    db
      .select({
        projectId: schema.actionItems.projectId,
        id: schema.actionItems.id,
        title: schema.actionItems.title,
      })
      .from(schema.actionItems)
      .where(
        and(
          inArray(schema.actionItems.projectId, ids),
          eq(schema.actionItems.status, "open"),
        ),
      )
      .orderBy(desc(schema.actionItems.createdAt)),
    db
      .select({
        projectId: schema.milestones.projectId,
        total: sql<number>`COUNT(*)::int`,
        done: sql<number>`COUNT(*) FILTER (WHERE ${schema.milestones.status} = 'done')::int`,
      })
      .from(schema.milestones)
      .where(inArray(schema.milestones.projectId, ids))
      .groupBy(schema.milestones.projectId),
  ]);

  const byProject = <T extends { projectId: string | null }>(rows: T[], pid: string, n: number) =>
    rows.filter((r) => r.projectId === pid).slice(0, n);
  const today = new Date().toISOString().slice(0, 10);

  return pinned.map((p) => {
    const openForP = tasks.filter((t) => t.projectId === p.id);
    const count = counts.find((c) => c.projectId === p.id);
    const total = count?.total ?? 0;
    const done = count?.done ?? 0;
    const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;
    const overdue = openForP.some((t) => t.dueDate && t.dueDate < today);
    const blocked = openForP.some((t) => t.status === "blocked");
    const health: PinnedProject["health"] = overdue ? "red" : blocked ? "amber" : "green";
    // Next milestone = earliest-due open task (undated last).
    const next = [...openForP].sort((a, b) =>
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"),
    )[0];
    return {
      id: p.id,
      title: p.title,
      status: p.status,
      progressPct,
      openTasks: openForP.length,
      totalTasks: total,
      health,
      nextMilestone: next ? { id: next.id, title: next.title, dueDate: next.dueDate } : null,
      docs: byProject(docs, p.id, 8).map((d) => ({ id: d.id, label: d.label, kind: d.kind, url: d.url, filename: d.filename, mime: d.mime })),
      tasks: byProject(tasks, p.id, 6).map((t) => ({ id: t.id, title: t.title, status: t.status, dueDate: t.dueDate })),
      actionItems: byProject(actionItems, p.id, 6).map((a) => ({ id: a.id, title: a.title })),
    };
  });
}

/** Toggle a project pin for a user. Returns the new pinned state. */
export async function togglePin(
  workspaceId: string,
  userId: string,
  projectId: string,
): Promise<boolean> {
  const existing = await db
    .select({ projectId: schema.projectPins.projectId })
    .from(schema.projectPins)
    .where(and(eq(schema.projectPins.userId, userId), eq(schema.projectPins.projectId, projectId)))
    .limit(1);
  if (existing.length) {
    await db
      .delete(schema.projectPins)
      .where(and(eq(schema.projectPins.userId, userId), eq(schema.projectPins.projectId, projectId)));
    return false;
  }
  // Only pin a project that belongs to the user's workspace.
  const [proj] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.workspaceId, workspaceId)))
    .limit(1);
  if (!proj) return false;
  await db
    .insert(schema.projectPins)
    .values({ userId, projectId, workspaceId })
    .onConflictDoNothing();
  return true;
}

/** Record that a user opened a project (upsert visited_at). */
export async function recordProjectVisit(
  workspaceId: string,
  userId: string,
  projectId: string,
): Promise<void> {
  await db
    .insert(schema.projectVisits)
    .values({ userId, projectId, workspaceId, visitedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.projectVisits.userId, schema.projectVisits.projectId],
      set: { visitedAt: new Date() },
    });
}

/** A user's recently opened projects (newest first). */
export async function listRecentProjects(
  workspaceId: string,
  userId: string,
  limit = 8,
): Promise<{ id: string; title: string }[]> {
  return db
    .select({ id: schema.projects.id, title: schema.projects.title })
    .from(schema.projectVisits)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.projectVisits.projectId))
    .where(and(eq(schema.projectVisits.userId, userId), eq(schema.projectVisits.workspaceId, workspaceId)))
    .orderBy(desc(schema.projectVisits.visitedAt))
    .limit(limit);
}
