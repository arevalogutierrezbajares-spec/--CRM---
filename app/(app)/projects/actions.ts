"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";
import {
  parseProjectFormData,
  type ProjectFormInput,
} from "@/lib/validation/project";
import {
  instantiateMilestonesFromTemplate,
  setMilestoneStatus,
  deleteMilestone,
} from "@/db/queries/milestones";

const { projects, projectContacts, pipelineStages } = schema;

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

async function syncContactLinks(projectId: string, contactIds: string[]) {
  await db.delete(projectContacts).where(eq(projectContacts.projectId, projectId));
  if (contactIds.length === 0) return;
  await db
    .insert(projectContacts)
    .values(
      contactIds.map((contactId, i) => ({
        projectId,
        contactId,
        role: i === 0 ? "primary" : "linked",
      })),
    );
}

async function firstStageId(templateId: string): Promise<string | null> {
  const [stage] = await db
    .select({ id: pipelineStages.id })
    .from(pipelineStages)
    .where(eq(pipelineStages.templateId, templateId))
    .orderBy(asc(pipelineStages.order))
    .limit(1);
  return stage?.id ?? null;
}

export async function createProject(
  _: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  let parsed: ProjectFormInput;
  try {
    parsed = parseProjectFormData(formData);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid input" };
  }

  const currentStageId = parsed.templateId
    ? await firstStageId(parsed.templateId)
    : null;

  const [inserted] = await db
    .insert(projects)
    .values({
      title: parsed.title,
      status: parsed.status,
      templateId: parsed.templateId ?? null,
      currentStageId,
      ownerId: user.id,
      dueDate: parsed.dueDate ?? null,
      waitingOn: parsed.waitingOn ?? null,
      expectedUnblockDate: parsed.expectedUnblockDate ?? null,
      notesPath: parsed.notesPath ?? null,
    })
    .returning({ id: projects.id });

  await syncContactLinks(inserted.id, parsed.contactIds);

  if (parsed.templateId) {
    await instantiateMilestonesFromTemplate({
      projectId: inserted.id,
      templateId: parsed.templateId,
      fallbackOwnerId: user.id,
      cofounderId: null,
    });
  }

  revalidatePath("/projects");
  redirect(`/projects/${inserted.id}`);
}

export async function updateProject(
  id: string,
  _: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  let parsed: ProjectFormInput;
  try {
    parsed = parseProjectFormData(formData);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid input" };
  }

  const [updated] = await db
    .update(projects)
    .set({
      title: parsed.title,
      status: parsed.status,
      dueDate: parsed.dueDate ?? null,
      waitingOn: parsed.waitingOn ?? null,
      expectedUnblockDate: parsed.expectedUnblockDate ?? null,
      notesPath: parsed.notesPath ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(projects.id, id), eq(projects.ownerId, user.id)))
    .returning({ id: projects.id });

  if (!updated) return { ok: false, error: "Project not found" };

  await syncContactLinks(updated.id, parsed.contactIds);

  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return { ok: true, id: updated.id };
}

export async function toggleMilestone(opts: {
  milestoneId: string;
  projectId: string;
  done: boolean;
}): Promise<ActionResult> {
  await requireUser();
  const row = await setMilestoneStatus({
    milestoneId: opts.milestoneId,
    projectId: opts.projectId,
    status: opts.done ? "done" : "pending",
  });
  if (!row) return { ok: false, error: "Milestone not found" };
  revalidatePath(`/projects/${opts.projectId}`);
  return { ok: true, id: row.id };
}

export async function blockMilestone(opts: {
  milestoneId: string;
  projectId: string;
  blockerText: string;
}): Promise<ActionResult> {
  await requireUser();
  const row = await setMilestoneStatus({
    milestoneId: opts.milestoneId,
    projectId: opts.projectId,
    status: "blocked",
    blockerText: opts.blockerText,
  });
  if (!row) return { ok: false, error: "Milestone not found" };
  revalidatePath(`/projects/${opts.projectId}`);
  return { ok: true, id: row.id };
}

export async function removeMilestone(opts: {
  milestoneId: string;
  projectId: string;
}): Promise<ActionResult> {
  await requireUser();
  const row = await deleteMilestone(opts);
  if (!row) return { ok: false, error: "Milestone not found" };
  revalidatePath(`/projects/${opts.projectId}`);
  return { ok: true, id: row.id };
}

export async function reassignMilestone(opts: {
  milestoneId: string;
  projectId: string;
  toOwnerId: string;
}): Promise<ActionResult> {
  const user = await requireUser();

  // Verify the user owns the project (so they're allowed to reassign).
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, opts.projectId), eq(projects.ownerId, user.id)))
    .limit(1);
  if (!project) return { ok: false, error: "Project not found" };

  const { milestones, users } = schema;
  const [targetUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, opts.toOwnerId))
    .limit(1);
  if (!targetUser) return { ok: false, error: "Target user not found" };

  const [row] = await db
    .update(milestones)
    .set({ ownerId: opts.toOwnerId })
    .where(
      and(
        eq(milestones.id, opts.milestoneId),
        eq(milestones.projectId, opts.projectId),
      ),
    )
    .returning({ id: milestones.id });
  if (!row) return { ok: false, error: "Milestone not found" };
  revalidatePath(`/projects/${opts.projectId}`);
  return { ok: true, id: row.id };
}

export async function advanceProjectStage(opts: {
  projectId: string;
  toStageId: string;
}): Promise<ActionResult> {
  const user = await requireUser();

  // Verify ownership + that the target stage belongs to the project's template.
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, opts.projectId), eq(projects.ownerId, user.id)))
    .limit(1);
  if (!project) return { ok: false, error: "Project not found" };
  if (!project.templateId) return { ok: false, error: "Project has no template" };

  const [stage] = await db
    .select()
    .from(pipelineStages)
    .where(
      and(
        eq(pipelineStages.id, opts.toStageId),
        eq(pipelineStages.templateId, project.templateId),
      ),
    )
    .limit(1);
  if (!stage) return { ok: false, error: "Stage not on this project's template" };

  await db
    .update(projects)
    .set({ currentStageId: stage.id, updatedAt: new Date() })
    .where(eq(projects.id, opts.projectId));

  revalidatePath("/pipeline");
  revalidatePath(`/projects/${opts.projectId}`);
  return { ok: true, id: opts.projectId };
}

export async function addMilestone(opts: {
  projectId: string;
  title: string;
  dueDate?: string | null;
}): Promise<ActionResult> {
  const user = await requireUser();
  if (!opts.title.trim()) return { ok: false, error: "Title required" };

  // Verify the project belongs to the user.
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, opts.projectId), eq(projects.ownerId, user.id)))
    .limit(1);
  if (!project) return { ok: false, error: "Project not found" };

  const { milestones } = schema;
  const [row] = await db
    .insert(milestones)
    .values({
      projectId: opts.projectId,
      title: opts.title.trim(),
      ownerId: user.id,
      dueDate: opts.dueDate ?? null,
    })
    .returning({ id: milestones.id });

  revalidatePath(`/projects/${opts.projectId}`);
  return { ok: true, id: row.id };
}
