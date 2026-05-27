import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { computeHealth, type HealthColor } from "@/lib/health";

const {
  projects,
  projectContacts,
  contacts,
  pipelineTemplates,
  pipelineStages,
  milestones,
} = schema;

export type ProjectRow = typeof projects.$inferSelect;
export type ProjectListItem = ProjectRow & {
  contactCount: number;
  milestoneOpenCount: number;
  milestoneOverdueCount: number;
  templateName: string | null;
  computedHealth: HealthColor;
};

export async function listProjects(opts: {
  workspaceId: string;
  status?: "active" | "waiting" | "done" | "lost";
}): Promise<ProjectListItem[]> {
  const conditions = [eq(projects.workspaceId, opts.workspaceId)];
  if (opts.status) conditions.push(eq(projects.status, opts.status));

  const rows = await db
    .select({
      project: projects,
      templateName: pipelineTemplates.name,
    })
    .from(projects)
    .leftJoin(pipelineTemplates, eq(pipelineTemplates.id, projects.templateId))
    .where(and(...conditions))
    .orderBy(desc(projects.updatedAt));

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.project.id);

  const [contactCounts, allMs] = await Promise.all([
    db
      .select({
        projectId: projectContacts.projectId,
        contactId: projectContacts.contactId,
      })
      .from(projectContacts)
      .where(inArray(projectContacts.projectId, ids)),
    db
      .select({
        projectId: milestones.projectId,
        status: milestones.status,
        dueDate: milestones.dueDate,
      })
      .from(milestones)
      .where(inArray(milestones.projectId, ids)),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return rows.map(({ project, templateName }) => {
    const projectMs = allMs.filter((m) => m.projectId === project.id);
    const computedHealth = computeHealth({
      status: project.status,
      expectedUnblockDate: project.expectedUnblockDate,
      milestones: projectMs.map((m) => ({
        status: m.status,
        dueDate: m.dueDate,
      })),
    });
    return {
      ...project,
      templateName,
      contactCount: contactCounts.filter((c) => c.projectId === project.id)
        .length,
      milestoneOpenCount: projectMs.filter((m) => m.status !== "done").length,
      milestoneOverdueCount: projectMs.filter(
        (m) => m.status !== "done" && m.dueDate && m.dueDate < today,
      ).length,
      computedHealth,
    };
  });
}

export async function getProject(opts: { id: string; workspaceId: string }) {
  const [row] = await db
    .select({
      project: projects,
      templateName: pipelineTemplates.name,
    })
    .from(projects)
    .leftJoin(pipelineTemplates, eq(pipelineTemplates.id, projects.templateId))
    .where(and(eq(projects.id, opts.id), eq(projects.workspaceId, opts.workspaceId)))
    .limit(1);

  if (!row) return null;

  const [linkedContacts, stages, projectMilestones] = await Promise.all([
    db
      .select({ contact: contacts })
      .from(projectContacts)
      .innerJoin(contacts, eq(contacts.id, projectContacts.contactId))
      .where(eq(projectContacts.projectId, row.project.id)),
    row.project.templateId
      ? db
          .select()
          .from(pipelineStages)
          .where(eq(pipelineStages.templateId, row.project.templateId))
          .orderBy(asc(pipelineStages.order))
      : Promise.resolve([] as (typeof pipelineStages.$inferSelect)[]),
    db
      .select()
      .from(milestones)
      .where(eq(milestones.projectId, row.project.id))
      .orderBy(asc(milestones.order), asc(milestones.createdAt)),
  ]);

  return {
    ...row.project,
    templateName: row.templateName,
    contacts: linkedContacts.map((c) => c.contact),
    stages,
    milestones: projectMilestones,
  };
}

export async function listTemplates() {
  return db.select().from(pipelineTemplates).orderBy(asc(pipelineTemplates.name));
}

export async function listStagesForTemplate(templateId: string) {
  return db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.templateId, templateId))
    .orderBy(asc(pipelineStages.order));
}

/* ─── Project links (Business / Marketing / Tech / etc.) ───────────────── */

export type ProjectLinkRow = typeof schema.projectLinks.$inferSelect;

export async function listProjectLinks(opts: {
  projectId: string;
  workspaceId: string;
}): Promise<ProjectLinkRow[]> {
  return db
    .select()
    .from(schema.projectLinks)
    .where(
      and(
        eq(schema.projectLinks.projectId, opts.projectId),
        eq(schema.projectLinks.workspaceId, opts.workspaceId),
      ),
    )
    .orderBy(asc(schema.projectLinks.category), asc(schema.projectLinks.sortOrder));
}
