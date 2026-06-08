import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { utcToday } from "@/lib/date/today";

export type PinnedDoc = {
  id: string;
  label: string;
  kind: string;
  category: string;
  url: string | null;
  filename: string | null;
  mime: string | null;
  updatedAt: string | null;
};
export type PinnedTask = { id: string; title: string; status: string; dueDate: string | null };
export type PinnedActionItem = { id: string; title: string };

export type PinnedProject = {
  id: string;
  title: string;
  status: string;
  lastUpdatedAt: string | null;
  progressPct: number;
  openTasks: number;
  totalTasks: number;
  health: "green" | "amber" | "red";
  nextMilestone: { id: string; title: string; dueDate: string | null } | null;
  docs: PinnedDoc[];
  latestDocs: PinnedDoc[];
  tasks: PinnedTask[];
  actionItems: PinnedActionItem[];
};

// Pins/visits operate on Lines of Business (the venture). Tasks/action items
// roll up from the LoB's child Projects; docs live directly on the LoB.

/** A user's pinned LoBs, id + title only — for the sidebar Favorites list. */
export async function listFavoriteProjects(
  workspaceId: string,
  userId: string,
): Promise<{ id: string; title: string }[]> {
  return db
    .select({ id: schema.linesOfBusiness.id, title: schema.linesOfBusiness.title })
    .from(schema.projectPins)
    .innerJoin(
      schema.linesOfBusiness,
      eq(schema.linesOfBusiness.id, schema.projectPins.lobId),
    )
    .where(
      and(
        eq(schema.projectPins.userId, userId),
        eq(schema.projectPins.workspaceId, workspaceId),
      ),
    )
    .orderBy(desc(schema.projectPins.createdAt));
}

/** A user's pinned LoBs, each with its docs/links + open tasks + open action items. */
export async function listPinnedProjects(
  workspaceId: string,
  userId: string,
  today: string = utcToday(),
): Promise<PinnedProject[]> {
  const pinned = await db
    .select({
      id: schema.linesOfBusiness.id,
      title: schema.linesOfBusiness.title,
      status: schema.linesOfBusiness.status,
      updatedAt: schema.linesOfBusiness.updatedAt,
    })
    .from(schema.projectPins)
    .innerJoin(
      schema.linesOfBusiness,
      eq(schema.linesOfBusiness.id, schema.projectPins.lobId),
    )
    .where(
      and(
        eq(schema.projectPins.userId, userId),
        eq(schema.projectPins.workspaceId, workspaceId),
      ),
    )
    .orderBy(desc(schema.projectPins.createdAt));

  if (pinned.length === 0) return [];
  const ids = pinned.map((p) => p.id);

  // Child Projects of the pinned LoBs, so milestones/action items roll up.
  const childProjects = await db
    .select({ id: schema.projects.id, lobId: schema.projects.lobId })
    .from(schema.projects)
    .where(inArray(schema.projects.lobId, ids));
  const projectIdToLob = new Map(childProjects.map((p) => [p.id, p.lobId]));
  const childIds = childProjects.map((p) => p.id);

  const [docs, taskRows, actionItemRows, countRows] = await Promise.all([
    db
      .select({
        lobId: schema.projectLinks.lobId,
        id: schema.projectLinks.id,
        label: schema.projectLinks.label,
        kind: schema.projectLinks.kind,
        category: schema.projectLinks.category,
        url: schema.projectLinks.url,
        filename: schema.projectLinks.originalFilename,
        mime: schema.projectLinks.mimeType,
        updatedAt: schema.projectLinks.updatedAt,
        createdAt: schema.projectLinks.createdAt,
        sortOrder: schema.projectLinks.sortOrder,
      })
      .from(schema.projectLinks)
      .where(inArray(schema.projectLinks.lobId, ids))
      .orderBy(desc(sql`coalesce(${schema.projectLinks.updatedAt}, ${schema.projectLinks.createdAt})`)),
    childIds.length
      ? db
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
              inArray(schema.milestones.projectId, childIds),
              sql`${schema.milestones.status} not in ('done', 'cancelled')`,
            ),
          )
          .orderBy(schema.milestones.order)
      : Promise.resolve(
          [] as { projectId: string; id: string; title: string; status: string; dueDate: string | null }[],
        ),
    childIds.length
      ? db
          .select({
            projectId: schema.actionItems.projectId,
            id: schema.actionItems.id,
            title: schema.actionItems.title,
          })
          .from(schema.actionItems)
          .where(
            and(
              inArray(schema.actionItems.projectId, childIds),
              eq(schema.actionItems.status, "open"),
            ),
          )
          .orderBy(desc(schema.actionItems.createdAt))
      : Promise.resolve([] as { projectId: string | null; id: string; title: string }[]),
    childIds.length
      ? db
          .select({
            projectId: schema.milestones.projectId,
            total: sql<number>`COUNT(*)::int`,
            done: sql<number>`COUNT(*) FILTER (WHERE ${schema.milestones.status} = 'done')::int`,
          })
          .from(schema.milestones)
          .where(inArray(schema.milestones.projectId, childIds))
          .groupBy(schema.milestones.projectId)
      : Promise.resolve([] as { projectId: string; total: number; done: number }[]),
  ]);

  // Re-key the Project-level rows onto their owning LoB.
  const tasks = taskRows.map((t) => ({ ...t, lobId: projectIdToLob.get(t.projectId) ?? null }));
  const actionItems = actionItemRows.map((a) => ({
    ...a,
    lobId: a.projectId ? projectIdToLob.get(a.projectId) ?? null : null,
  }));

  const byLob = <T extends { lobId: string | null }>(rows: T[], lid: string, n: number) =>
    rows.filter((r) => r.lobId === lid).slice(0, n);

  return pinned.map((p) => {
    const openForP = tasks.filter((t) => t.lobId === p.id);
    let total = 0;
    let done = 0;
    for (const c of countRows) {
      if (projectIdToLob.get(c.projectId) === p.id) {
        total += c.total;
        done += c.done;
      }
    }
    const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;
    const overdue = openForP.some((t) => t.dueDate && t.dueDate < today);
    const blocked = openForP.some((t) => t.status === "blocked");
    const health: PinnedProject["health"] = overdue ? "red" : blocked ? "amber" : "green";
    // Next milestone = earliest-due open task (undated last).
    const next = [...openForP].sort((a, b) =>
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"),
    )[0];
    const docsForP = docs
      .filter((d) => d.lobId === p.id)
      .map((d) => ({
        id: d.id,
        label: d.label,
        kind: d.kind,
        category: d.category,
        url: d.url,
        filename: d.filename,
        mime: d.mime,
        updatedAt: (d.updatedAt ?? d.createdAt)?.toISOString() ?? null,
      }));
    const latestDocs = docsForP
      .slice()
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
      .slice(0, 3);

    return {
      id: p.id,
      title: p.title,
      status: p.status,
      lastUpdatedAt: latestDocs[0]?.updatedAt ?? p.updatedAt.toISOString(),
      progressPct,
      openTasks: openForP.length,
      totalTasks: total,
      health,
      nextMilestone: next ? { id: next.id, title: next.title, dueDate: next.dueDate } : null,
      docs: docsForP.slice(0, 8),
      latestDocs,
      tasks: byLob(tasks, p.id, 6).map((t) => ({ id: t.id, title: t.title, status: t.status, dueDate: t.dueDate })),
      actionItems: byLob(actionItems, p.id, 6).map((a) => ({ id: a.id, title: a.title })),
    };
  });
}

/** Toggle an LoB pin for a user. Returns the new pinned state. */
export async function togglePin(
  workspaceId: string,
  userId: string,
  lobId: string,
): Promise<boolean> {
  const existing = await db
    .select({ lobId: schema.projectPins.lobId })
    .from(schema.projectPins)
    .where(and(eq(schema.projectPins.userId, userId), eq(schema.projectPins.lobId, lobId)))
    .limit(1);
  if (existing.length) {
    await db
      .delete(schema.projectPins)
      .where(and(eq(schema.projectPins.userId, userId), eq(schema.projectPins.lobId, lobId)));
    return false;
  }
  // Only pin an LoB that belongs to the user's workspace.
  const [lob] = await db
    .select({ id: schema.linesOfBusiness.id })
    .from(schema.linesOfBusiness)
    .where(
      and(eq(schema.linesOfBusiness.id, lobId), eq(schema.linesOfBusiness.workspaceId, workspaceId)),
    )
    .limit(1);
  if (!lob) return false;
  await db
    .insert(schema.projectPins)
    .values({ userId, lobId, workspaceId })
    .onConflictDoNothing();
  return true;
}

/** Record that a user opened an LoB (upsert visited_at). */
export async function recordProjectVisit(
  workspaceId: string,
  userId: string,
  lobId: string,
): Promise<void> {
  // Fence the FK: never bind a foreign LoB to this workspace's visit log.
  const [lob] = await db
    .select({ id: schema.linesOfBusiness.id })
    .from(schema.linesOfBusiness)
    .where(
      and(eq(schema.linesOfBusiness.id, lobId), eq(schema.linesOfBusiness.workspaceId, workspaceId)),
    )
    .limit(1);
  if (!lob) return;
  await db
    .insert(schema.projectVisits)
    .values({ userId, lobId, workspaceId, visitedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.projectVisits.userId, schema.projectVisits.lobId],
      set: { visitedAt: new Date() },
    });
}

/** A user's recently opened LoBs (newest first). */
export async function listRecentProjects(
  workspaceId: string,
  userId: string,
  limit = 8,
): Promise<{ id: string; title: string }[]> {
  return db
    .select({ id: schema.linesOfBusiness.id, title: schema.linesOfBusiness.title })
    .from(schema.projectVisits)
    .innerJoin(
      schema.linesOfBusiness,
      eq(schema.linesOfBusiness.id, schema.projectVisits.lobId),
    )
    .where(and(eq(schema.projectVisits.userId, userId), eq(schema.projectVisits.workspaceId, workspaceId)))
    .orderBy(desc(schema.projectVisits.visitedAt))
    .limit(limit);
}
