import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { computeHealth, type HealthColor } from "@/lib/health";

const { projects, linesOfBusiness, milestones } = schema;

type MilestoneStatus = (typeof milestones.$inferSelect)["status"];

export type ProjectRow = typeof projects.$inferSelect;
export type ProjectListItem = ProjectRow & {
  lobTitle: string;
  milestoneOpenCount: number;
  milestoneOverdueCount: number;
  milestoneTotalCount: number;
  milestoneDoneCount: number;
  milestoneProgressPct: number;
  computedHealth: HealthColor;
};

function enrich(
  project: ProjectRow & { lobTitle: string },
  projectMs: { status: MilestoneStatus; dueDate: string | null }[],
): ProjectListItem {
  const today = new Date().toISOString().slice(0, 10);
  const total = projectMs.length;
  const doneCount = projectMs.filter((m) => m.status === "done").length;
  return {
    ...project,
    computedHealth: computeHealth({
      status: project.status,
      expectedUnblockDate: project.expectedUnblockDate,
      milestones: projectMs.map((m) => ({ status: m.status, dueDate: m.dueDate })),
    }),
    milestoneOpenCount: projectMs.filter((m) => m.status !== "done").length,
    milestoneOverdueCount: projectMs.filter(
      (m) => m.status !== "done" && m.dueDate && m.dueDate < today,
    ).length,
    milestoneTotalCount: total,
    milestoneDoneCount: doneCount,
    milestoneProgressPct: total === 0 ? 0 : Math.round((doneCount / total) * 100),
  };
}

async function decorate(
  rows: (ProjectRow & { lobTitle: string })[],
): Promise<ProjectListItem[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const allMs = await db
    .select({
      projectId: milestones.projectId,
      status: milestones.status,
      dueDate: milestones.dueDate,
    })
    .from(milestones)
    .where(inArray(milestones.projectId, ids));
  return rows.map((p) =>
    enrich(
      p,
      allMs.filter((m) => m.projectId === p.id),
    ),
  );
}

/** All projects in the workspace (e.g. for treasury/meetings pickers), each tagged with its LoB. */
export async function listProjects(opts: {
  workspaceId: string;
  status?: "active" | "waiting" | "done" | "lost";
}): Promise<ProjectListItem[]> {
  const conditions = [eq(projects.workspaceId, opts.workspaceId)];
  if (opts.status) conditions.push(eq(projects.status, opts.status));
  const rows = await db
    .select({ project: projects, lobTitle: linesOfBusiness.title })
    .from(projects)
    .innerJoin(linesOfBusiness, eq(linesOfBusiness.id, projects.lobId))
    .where(and(...conditions))
    .orderBy(desc(projects.updatedAt));
  return decorate(rows.map((r) => ({ ...r.project, lobTitle: r.lobTitle })));
}

/** Child projects of a single Line of Business. */
export async function listProjectsForLob(opts: {
  lobId: string;
  workspaceId: string;
}): Promise<ProjectListItem[]> {
  const rows = await db
    .select({ project: projects, lobTitle: linesOfBusiness.title })
    .from(projects)
    .innerJoin(linesOfBusiness, eq(linesOfBusiness.id, projects.lobId))
    .where(
      and(eq(projects.lobId, opts.lobId), eq(projects.workspaceId, opts.workspaceId)),
    )
    .orderBy(desc(projects.updatedAt));
  return decorate(rows.map((r) => ({ ...r.project, lobTitle: r.lobTitle })));
}

export async function getProject(opts: { id: string; workspaceId: string }) {
  const [row] = await db
    .select({ project: projects, lobTitle: linesOfBusiness.title })
    .from(projects)
    .innerJoin(linesOfBusiness, eq(linesOfBusiness.id, projects.lobId))
    .where(and(eq(projects.id, opts.id), eq(projects.workspaceId, opts.workspaceId)))
    .limit(1);

  if (!row) return null;

  const projectMilestones = await db
    .select()
    .from(milestones)
    .where(eq(milestones.projectId, row.project.id))
    .orderBy(asc(milestones.order), asc(milestones.createdAt));

  return {
    ...row.project,
    lobTitle: row.lobTitle,
    milestones: projectMilestones,
  };
}
