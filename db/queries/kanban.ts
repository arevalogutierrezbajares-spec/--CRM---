import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { computeHealth, type HealthColor } from "@/lib/health";

const { linesOfBusiness, projects, pipelineStages, pipelineTemplates, milestones } =
  schema;

export type KanbanCard = {
  id: string;
  title: string;
  status: "active" | "waiting" | "done" | "lost";
  health: HealthColor;
  openMilestones: number;
  overdueMilestones: number;
  waitingOn: string | null;
};

export type KanbanColumn = {
  stageId: string;
  stageName: string;
  order: number;
  cards: KanbanCard[];
};

export type KanbanBoard = {
  templateId: string;
  templateName: string;
  columns: KanbanColumn[];
};

export async function listPipelineTemplatesWithStages() {
  const [templates, stages] = await Promise.all([
    db.select().from(pipelineTemplates).orderBy(asc(pipelineTemplates.name)),
    db.select().from(pipelineStages).orderBy(asc(pipelineStages.order)),
  ]);
  return templates.map((t) => ({
    ...t,
    stages: stages.filter((s) => s.templateId === t.id),
  }));
}

export async function getKanban(opts: {
  workspaceId: string;
  templateId: string;
}): Promise<KanbanBoard | null> {
  const [template] = await db
    .select()
    .from(pipelineTemplates)
    .where(eq(pipelineTemplates.id, opts.templateId))
    .limit(1);
  if (!template) return null;

  const stages = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.templateId, opts.templateId))
    .orderBy(asc(pipelineStages.order));

  // The pipeline tracks Lines of Business (the venture-level pipeline).
  const templateLobs = await db
    .select()
    .from(linesOfBusiness)
    .where(
      and(
        eq(linesOfBusiness.workspaceId, opts.workspaceId),
        eq(linesOfBusiness.templateId, opts.templateId),
      ),
    );

  const lobIds = templateLobs.map((l) => l.id);
  // Milestones live on child Projects; roll them up to the owning LoB.
  const childProjects = lobIds.length
    ? await db
        .select({ id: projects.id, lobId: projects.lobId })
        .from(projects)
        .where(inArray(projects.lobId, lobIds))
    : [];
  const projectIdToLob = new Map(childProjects.map((p) => [p.id, p.lobId]));
  const projectIds = childProjects.map((p) => p.id);
  const allMs =
    projectIds.length === 0
      ? []
      : await db
          .select()
          .from(milestones)
          .where(inArray(milestones.projectId, projectIds));

  const today = new Date().toISOString().slice(0, 10);

  return {
    templateId: template.id,
    templateName: template.name,
    columns: stages.map((s) => {
      const cards = templateLobs
        .filter((p) => p.currentStageId === s.id)
        .map<KanbanCard>((p) => {
          const ms = allMs.filter((m) => projectIdToLob.get(m.projectId) === p.id);
          return {
            id: p.id,
            title: p.title,
            status: p.status,
            health: computeHealth({
              status: p.status,
              expectedUnblockDate: p.expectedUnblockDate,
              milestones: ms.map((m) => ({
                status: m.status,
                dueDate: m.dueDate,
              })),
            }),
            openMilestones: ms.filter((m) => m.status !== "done").length,
            overdueMilestones: ms.filter(
              (m) => m.status !== "done" && m.dueDate && m.dueDate < today,
            ).length,
            waitingOn: p.waitingOn,
          };
        });
      return {
        stageId: s.id,
        stageName: s.name,
        order: s.order,
        cards,
      };
    }),
  };
}
