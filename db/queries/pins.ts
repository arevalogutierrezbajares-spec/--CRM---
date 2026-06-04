import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

export type PinnedDoc = { id: string; label: string; kind: string; url: string | null };
export type PinnedTask = { id: string; title: string; status: string };
export type PinnedActionItem = { id: string; title: string };

export type PinnedProject = {
  id: string;
  title: string;
  status: string;
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

  const [docs, tasks, actionItems] = await Promise.all([
    db
      .select({
        projectId: schema.projectLinks.projectId,
        id: schema.projectLinks.id,
        label: schema.projectLinks.label,
        kind: schema.projectLinks.kind,
        url: schema.projectLinks.url,
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
  ]);

  const byProject = <T extends { projectId: string | null }>(rows: T[], pid: string, n: number) =>
    rows.filter((r) => r.projectId === pid).slice(0, n);

  return pinned.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    docs: byProject(docs, p.id, 8).map((d) => ({ id: d.id, label: d.label, kind: d.kind, url: d.url })),
    tasks: byProject(tasks, p.id, 6).map((t) => ({ id: t.id, title: t.title, status: t.status })),
    actionItems: byProject(actionItems, p.id, 6).map((a) => ({ id: a.id, title: a.title })),
  }));
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
