import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

const { milestones, pipelineStages } = schema;

export type MilestoneRow = typeof milestones.$inferSelect;

export type InstantiateMilestonesArgs = {
  projectId: string;
  templateId: string;
  fallbackOwnerId: string; // Tomas's user id — used when default_owner=tomas|either
  cofounderId?: string | null; // user id for default_owner=cofounder; falls back to Tomas if absent
};

/**
 * For a project created with a template, create one Milestone per pipeline_stage
 * with due_date = NOW() + sla_days and owner resolved from default_owner enum.
 */
export async function instantiateMilestonesFromTemplate(
  args: InstantiateMilestonesArgs,
) {
  const stages = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.templateId, args.templateId));
  if (stages.length === 0) return [];

  const sorted = [...stages].sort((a, b) => a.order - b.order);
  const today = new Date();

  const rows = sorted.map((stage) => {
    const dueDate =
      typeof stage.slaDays === "number"
        ? new Date(today.getTime() + stage.slaDays * 86400000)
            .toISOString()
            .slice(0, 10)
        : null;

    const ownerId =
      stage.defaultOwner === "cofounder"
        ? args.cofounderId ?? args.fallbackOwnerId
        : args.fallbackOwnerId;

    return {
      projectId: args.projectId,
      title: stage.name,
      dueDate,
      ownerId,
      order: stage.order,
    };
  });

  if (rows.length === 0) return [];
  return db.insert(milestones).values(rows).returning();
}

export async function setMilestoneStatus(opts: {
  milestoneId: string;
  projectId: string;
  status: "pending" | "done" | "blocked";
  blockerText?: string | null;
}) {
  const completedAt = opts.status === "done" ? new Date() : null;
  const [row] = await db
    .update(milestones)
    .set({
      status: opts.status,
      blockerText:
        opts.status === "blocked" ? opts.blockerText ?? null : null,
      completedAt,
    })
    .where(
      and(
        eq(milestones.id, opts.milestoneId),
        eq(milestones.projectId, opts.projectId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function deleteMilestone(opts: {
  milestoneId: string;
  projectId: string;
}) {
  const [row] = await db
    .delete(milestones)
    .where(
      and(
        eq(milestones.id, opts.milestoneId),
        eq(milestones.projectId, opts.projectId),
      ),
    )
    .returning({ id: milestones.id });
  return row ?? null;
}

export async function listOpenMilestonesForProjects(projectIds: string[]) {
  if (projectIds.length === 0) return [];
  return db
    .select()
    .from(milestones)
    .where(inArray(milestones.projectId, projectIds));
}
