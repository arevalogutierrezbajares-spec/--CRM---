import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { computeHealth, type HealthColor } from "@/lib/health";

const { projects, pipelineStages, pipelineTemplates, milestones } = schema;

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
  ownerId: string;
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

  const templateProjects = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.ownerId, opts.ownerId),
        eq(projects.templateId, opts.templateId),
      ),
    );

  const projectIds = templateProjects.map((p) => p.id);
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
      const cards = templateProjects
        .filter((p) => p.currentStageId === s.id)
        .map<KanbanCard>((p) => {
          const ms = allMs.filter((m) => m.projectId === p.id);
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
