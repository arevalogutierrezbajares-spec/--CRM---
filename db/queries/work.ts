import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const {
  themes,
  initiatives,
  sprints,
  initiativeThemes,
  milestoneThemes,
  milestones,
  projects,
  linesOfBusiness,
  users,
} = schema;

/* ─── Themes ───────────────────────────────────────────────────────────── */

export type ThemeRow = typeof themes.$inferSelect;

export async function listThemes(workspaceId: string): Promise<ThemeRow[]> {
  return db
    .select()
    .from(themes)
    .where(
      and(eq(themes.workspaceId, workspaceId), eq(themes.archived, false)),
    )
    .orderBy(themes.name);
}

const SEED_THEMES: Array<{ name: string; color: string; icon: string }> = [
  { name: "Business Development", color: "#0F6E56", icon: "Briefcase" },
  { name: "Tech", color: "#185FA5", icon: "Server" },
  { name: "AI", color: "#534AB7", icon: "Sparkles" },
  { name: "Growth", color: "#3B6D11", icon: "TrendingUp" },
  { name: "Brand", color: "#A32D2D", icon: "Palette" },
  { name: "Ops", color: "#854F0B", icon: "Wrench" },
  { name: "Fundraising", color: "#BA7517", icon: "DollarSign" },
  { name: "Legal & Compliance", color: "#6B6B68", icon: "Scale" },
];

export async function seedDefaultThemes(workspaceId: string): Promise<void> {
  const existing = await db
    .select({ name: themes.name })
    .from(themes)
    .where(eq(themes.workspaceId, workspaceId));
  const have = new Set(existing.map((e) => e.name));
  const missing = SEED_THEMES.filter((t) => !have.has(t.name));
  if (missing.length === 0) return;
  await db.insert(themes).values(
    missing.map((t) => ({
      workspaceId,
      name: t.name,
      color: t.color,
      icon: t.icon,
    })),
  );
}

/* ─── Initiatives ──────────────────────────────────────────────────────── */

export type InitiativeRow = typeof initiatives.$inferSelect;
export type InitiativeListItem = InitiativeRow & {
  projectTitle: string | null;
  ownerName: string | null;
  themes: ThemeRow[];
  taskCount: number;
  taskDoneCount: number;
  progressPct: number;
};

export async function listInitiatives(opts: {
  workspaceId: string;
  status?: "planning" | "active" | "paused" | "done" | "cancelled";
  priority?: "now" | "next" | "later" | "backlog";
  projectId?: string;
  themeId?: string;
  ownerUserId?: string;
}): Promise<InitiativeListItem[]> {
  const conditions = [eq(initiatives.workspaceId, opts.workspaceId)];
  if (opts.status) conditions.push(eq(initiatives.status, opts.status));
  if (opts.priority) conditions.push(eq(initiatives.priority, opts.priority));
  if (opts.projectId) conditions.push(eq(initiatives.lobId, opts.projectId));
  if (opts.ownerUserId)
    conditions.push(eq(initiatives.ownerUserId, opts.ownerUserId));

  const rows = await db
    .select({
      init: initiatives,
      projectTitle: linesOfBusiness.title,
      ownerName: users.displayName,
    })
    .from(initiatives)
    .leftJoin(linesOfBusiness, eq(linesOfBusiness.id, initiatives.lobId))
    .leftJoin(users, eq(users.id, initiatives.ownerUserId))
    .where(and(...conditions))
    .orderBy(desc(initiatives.updatedAt));

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.init.id);

  const [themeJoins, msAgg] = await Promise.all([
    db
      .select({
        initiativeId: initiativeThemes.initiativeId,
        theme: themes,
      })
      .from(initiativeThemes)
      .innerJoin(themes, eq(themes.id, initiativeThemes.themeId))
      .where(inArray(initiativeThemes.initiativeId, ids)),
    db
      .select({
        initiativeId: milestones.initiativeId,
        total: sql<number>`COUNT(*)::int`,
        done: sql<number>`SUM(CASE WHEN ${milestones.status} = 'done' THEN 1 ELSE 0 END)::int`,
      })
      .from(milestones)
      .where(inArray(milestones.initiativeId, ids))
      .groupBy(milestones.initiativeId),
  ]);

  const enriched = rows.map(({ init, projectTitle, ownerName }) => {
    const myThemes = themeJoins
      .filter((t) => t.initiativeId === init.id)
      .map((t) => t.theme);
    const agg = msAgg.find((a) => a.initiativeId === init.id);
    const total = agg?.total ?? 0;
    const done = agg?.done ?? 0;
    return {
      ...init,
      projectTitle,
      ownerName,
      themes: myThemes,
      taskCount: total,
      taskDoneCount: done,
      progressPct: total === 0 ? 0 : Math.round((done / total) * 100),
    };
  });

  // Theme filter is post-join (m2m); applied in memory
  if (opts.themeId) {
    return enriched.filter((init) =>
      init.themes.some((t) => t.id === opts.themeId),
    );
  }
  return enriched;
}

export async function getInitiative(opts: {
  id: string;
  workspaceId: string;
}): Promise<InitiativeListItem | null> {
  const list = await listInitiatives({ workspaceId: opts.workspaceId });
  return list.find((i) => i.id === opts.id) ?? null;
}

/* ─── Sprints ──────────────────────────────────────────────────────────── */

export type SprintRow = typeof sprints.$inferSelect;
export type SprintWithStats = SprintRow & {
  taskCount: number;
  taskDoneCount: number;
  progressPct: number;
  initiativeTitle: string | null;
};

export async function listSprints(
  workspaceId: string,
): Promise<SprintWithStats[]> {
  const rows = await db
    .select({
      sprint: sprints,
      initiativeTitle: initiatives.title,
    })
    .from(sprints)
    .leftJoin(initiatives, eq(initiatives.id, sprints.initiativeId))
    .where(eq(sprints.workspaceId, workspaceId))
    .orderBy(desc(sprints.startDate));

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.sprint.id);
  const agg = await db
    .select({
      sprintId: milestones.sprintId,
      total: sql<number>`COUNT(*)::int`,
      done: sql<number>`SUM(CASE WHEN ${milestones.status} = 'done' THEN 1 ELSE 0 END)::int`,
    })
    .from(milestones)
    .where(inArray(milestones.sprintId, ids))
    .groupBy(milestones.sprintId);

  return rows.map(({ sprint, initiativeTitle }) => {
    const a = agg.find((x) => x.sprintId === sprint.id);
    const total = a?.total ?? 0;
    const done = a?.done ?? 0;
    return {
      ...sprint,
      initiativeTitle,
      taskCount: total,
      taskDoneCount: done,
      progressPct: total === 0 ? 0 : Math.round((done / total) * 100),
    };
  });
}

export async function getActiveSprint(
  workspaceId: string,
): Promise<SprintWithStats | null> {
  const all = await listSprints(workspaceId);
  return all.find((s) => s.status === "active") ?? null;
}

/* ─── Tasks (milestones) — rich listing with new columns ───────────────── */

export type WorkTask = typeof milestones.$inferSelect & {
  projectTitle: string | null;
  initiativeTitle: string | null;
  sprintName: string | null;
  /** Coalesced owner id (assigneeUserId, else legacy assignedTo) — matches the
   *  dashboard's grouping so /work and home agree on who owns a task. */
  ownerUserId: string | null;
  assigneeName: string | null;
  themes: ThemeRow[];
};

export async function listWorkTasks(opts: {
  workspaceId: string;
  initiativeId?: string;
  sprintId?: string;
  projectId?: string;
  themeId?: string;
  priority?: "now" | "next" | "later" | "backlog";
  assigneeUserId?: string;
  limit?: number;
}): Promise<WorkTask[]> {
  const conditions = [eq(projects.workspaceId, opts.workspaceId)];
  if (opts.initiativeId)
    conditions.push(eq(milestones.initiativeId, opts.initiativeId));
  if (opts.sprintId) conditions.push(eq(milestones.sprintId, opts.sprintId));
  if (opts.projectId) conditions.push(eq(milestones.projectId, opts.projectId));
  if (opts.priority) conditions.push(eq(milestones.priority, opts.priority));
  if (opts.assigneeUserId)
    conditions.push(
      sql`coalesce(${milestones.assigneeUserId}, ${milestones.assignedTo}) = ${opts.assigneeUserId}`,
    );

  const ownerExpr = sql<string | null>`coalesce(${milestones.assigneeUserId}, ${milestones.assignedTo})`;
  const rows = await db
    .select({
      ms: milestones,
      projectTitle: projects.title,
      initiativeTitle: initiatives.title,
      sprintName: sprints.name,
      ownerUserId: ownerExpr,
      assigneeName: users.displayName,
    })
    .from(milestones)
    .innerJoin(projects, eq(projects.id, milestones.projectId))
    .leftJoin(initiatives, eq(initiatives.id, milestones.initiativeId))
    .leftJoin(sprints, eq(sprints.id, milestones.sprintId))
    .leftJoin(users, eq(users.id, sql`coalesce(${milestones.assigneeUserId}, ${milestones.assignedTo})`))
    .where(and(...conditions))
    .orderBy(asc(milestones.dueDate), desc(milestones.createdAt))
    .limit(opts.limit ?? 200);

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.ms.id);
  const themeJoins = await db
    .select({ milestoneId: milestoneThemes.milestoneId, theme: themes })
    .from(milestoneThemes)
    .innerJoin(themes, eq(themes.id, milestoneThemes.themeId))
    .where(inArray(milestoneThemes.milestoneId, ids));

  const enriched = rows.map(({ ms, projectTitle, initiativeTitle, sprintName, ownerUserId, assigneeName }) => ({
    ...ms,
    projectTitle,
    initiativeTitle,
    sprintName,
    ownerUserId,
    assigneeName,
    themes: themeJoins
      .filter((t) => t.milestoneId === ms.id)
      .map((t) => t.theme),
  }));

  if (opts.themeId) {
    return enriched.filter((t) =>
      t.themes.some((th) => th.id === opts.themeId),
    );
  }
  return enriched;
}
