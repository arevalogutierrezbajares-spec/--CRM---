import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const { overlordSections, overlordTasks } = schema;

export type OverlordSection = typeof overlordSections.$inferSelect;
export type OverlordTask = typeof overlordTasks.$inferSelect;
export type OverlordTaskWithSection = OverlordTask & {
  sectionKey: string;
  sectionName: string;
};

export async function listOverlordSections(
  workspaceId: string,
): Promise<OverlordSection[]> {
  return db
    .select()
    .from(overlordSections)
    .where(eq(overlordSections.workspaceId, workspaceId))
    .orderBy(overlordSections.name);
}

export type OverlordCounts = {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  bySection: Array<{ sectionKey: string; sectionName: string; count: number; active: number }>;
  bySectionId: Map<string, { count: number; active: number }>;
  activeAgents: Array<{ agent: string; count: number }>;
  lastSync: Date | null;
};

export async function overlordCounts(
  workspaceId: string,
): Promise<OverlordCounts> {
  const [tasks, sections] = await Promise.all([
    db
      .select({
        sectionId: overlordTasks.sectionId,
        status: overlordTasks.status,
        priority: overlordTasks.priority,
        claimedByAgent: overlordTasks.claimedByAgent,
      })
      .from(overlordTasks)
      .where(eq(overlordTasks.workspaceId, workspaceId)),
    db
      .select()
      .from(overlordSections)
      .where(eq(overlordSections.workspaceId, workspaceId)),
  ]);

  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const agentCounts = new Map<string, number>();
  const bySectionMap = new Map<string, { count: number; active: number }>();

  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    if (t.priority) byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;

    if (
      t.claimedByAgent &&
      (t.status === "in_progress" || t.status === "in_review")
    ) {
      agentCounts.set(
        t.claimedByAgent,
        (agentCounts.get(t.claimedByAgent) ?? 0) + 1,
      );
    }

    const sec = bySectionMap.get(t.sectionId) ?? { count: 0, active: 0 };
    sec.count += 1;
    if (
      t.status === "todo" ||
      t.status === "in_progress" ||
      t.status === "in_review" ||
      t.status === "blocked"
    ) {
      sec.active += 1;
    }
    bySectionMap.set(t.sectionId, sec);
  }

  const bySection = sections
    .map((s) => {
      const c = bySectionMap.get(s.id) ?? { count: 0, active: 0 };
      return {
        sectionKey: s.sectionKey,
        sectionName: s.name,
        count: c.count,
        active: c.active,
      };
    })
    .filter((s) => s.count > 0)
    .sort((a, b) => b.active - a.active);

  const activeAgents = Array.from(agentCounts.entries())
    .map(([agent, count]) => ({ agent, count }))
    .sort((a, b) => b.count - a.count);

  const lastSync = sections
    .map((s) => s.lastSyncedAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  return {
    total: tasks.length,
    byStatus,
    byPriority,
    bySection,
    bySectionId: bySectionMap,
    activeAgents,
    lastSync,
  };
}

export async function listOverlordTasks(opts: {
  workspaceId: string;
  sectionKey?: string;
  status?: string;
  priority?: string;
  agent?: string;
  limit?: number;
}): Promise<OverlordTaskWithSection[]> {
  const conditions = [eq(overlordTasks.workspaceId, opts.workspaceId)];

  if (opts.status) conditions.push(eq(overlordTasks.status, opts.status as "todo" | "in_progress" | "in_review" | "blocked" | "completed" | "cancelled"));
  if (opts.priority) conditions.push(eq(overlordTasks.priority, opts.priority as "NOW" | "NEXT" | "LATER" | "BACKLOG"));
  if (opts.agent) conditions.push(eq(overlordTasks.claimedByAgent, opts.agent));

  const rows = await db
    .select({
      task: overlordTasks,
      sectionKey: overlordSections.sectionKey,
      sectionName: overlordSections.name,
    })
    .from(overlordTasks)
    .innerJoin(
      overlordSections,
      eq(overlordSections.id, overlordTasks.sectionId),
    )
    .where(and(...conditions))
    .orderBy(
      desc(overlordTasks.lastSyncedAt),
      desc(overlordTasks.lastModifiedDate),
    )
    .limit(opts.limit ?? 100);

  let filtered = rows;
  if (opts.sectionKey) {
    filtered = rows.filter((r) => r.sectionKey === opts.sectionKey);
  }

  return filtered.map((r) => ({
    ...r.task,
    sectionKey: r.sectionKey,
    sectionName: r.sectionName,
  }));
}

export async function getOverlordTask(opts: {
  workspaceId: string;
  taskKey: string;
}): Promise<OverlordTaskWithSection | null> {
  const [row] = await db
    .select({
      task: overlordTasks,
      sectionKey: overlordSections.sectionKey,
      sectionName: overlordSections.name,
    })
    .from(overlordTasks)
    .innerJoin(
      overlordSections,
      eq(overlordSections.id, overlordTasks.sectionId),
    )
    .where(
      and(
        eq(overlordTasks.workspaceId, opts.workspaceId),
        eq(overlordTasks.taskKey, opts.taskKey),
      ),
    )
    .limit(1);
  if (!row) return null;
  return { ...row.task, sectionKey: row.sectionKey, sectionName: row.sectionName };
}

/** Latest activity log entries across all Overlord tasks — global timeline. */
export type OverlordActivityEvent = {
  ts: string;
  agent: string;
  note: string;
  taskKey: string;
  taskTitle: string;
  sectionKey: string;
  status: string;
};

export async function listOverlordActivity(
  workspaceId: string,
  limit = 30,
): Promise<OverlordActivityEvent[]> {
  const rows = await db
    .select({
      task: overlordTasks,
      sectionKey: overlordSections.sectionKey,
    })
    .from(overlordTasks)
    .innerJoin(
      overlordSections,
      eq(overlordSections.id, overlordTasks.sectionId),
    )
    .where(eq(overlordTasks.workspaceId, workspaceId))
    .orderBy(desc(overlordTasks.lastModifiedDate))
    .limit(150);

  const events: OverlordActivityEvent[] = [];
  for (const r of rows) {
    const log = (r.task.activityLog ?? []) as Array<{
      ts: string;
      agent: string;
      note: string;
    }>;
    for (const e of log) {
      events.push({
        ts: e.ts,
        agent: e.agent,
        note: e.note,
        taskKey: r.task.taskKey,
        taskTitle: r.task.title,
        sectionKey: r.sectionKey,
        status: r.task.status,
      });
    }
  }
  events.sort((a, b) => (a.ts > b.ts ? -1 : 1));
  return events.slice(0, limit);
}
