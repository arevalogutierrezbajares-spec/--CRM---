"use server";

import { and, eq } from "drizzle-orm";
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

const { projects, linesOfBusiness, milestones, workspaceMembers } = schema;

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/** Validate that an LoB belongs to the workspace; returns its templateId if any. */
async function lobInWorkspace(
  lobId: string,
  workspaceId: string,
): Promise<{ id: string; templateId: string | null } | null> {
  const [lob] = await db
    .select({ id: linesOfBusiness.id, templateId: linesOfBusiness.templateId })
    .from(linesOfBusiness)
    .where(
      and(eq(linesOfBusiness.id, lobId), eq(linesOfBusiness.workspaceId, workspaceId)),
    )
    .limit(1);
  return lob ?? null;
}

async function projectInWorkspace(
  projectId: string,
  workspaceId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
    .limit(1);
  return Boolean(row);
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

  const lob = await lobInWorkspace(parsed.lobId, user.workspaceId);
  if (!lob) return { ok: false, error: "Line of business not found" };

  const [inserted] = await db
    .insert(projects)
    .values({
      lobId: parsed.lobId,
      title: parsed.title,
      status: parsed.status,
      workspaceId: user.workspaceId,
      dueDate: parsed.dueDate ?? null,
      waitingOn: parsed.waitingOn ?? null,
      expectedUnblockDate: parsed.expectedUnblockDate ?? null,
      createdBy: user.id,
    })
    .returning({ id: projects.id });

  // Seed milestones from the parent LoB's pipeline template, if it has one.
  if (lob.templateId) {
    await instantiateMilestonesFromTemplate({
      projectId: inserted.id,
      templateId: lob.templateId,
      workspaceId: user.workspaceId,
      createdBy: user.id,
      cofounderId: null,
    });
  }

  revalidatePath(`/lob/${parsed.lobId}`);
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

  if (!(await lobInWorkspace(parsed.lobId, user.workspaceId))) {
    return { ok: false, error: "Line of business not found" };
  }

  const [updated] = await db
    .update(projects)
    .set({
      lobId: parsed.lobId,
      title: parsed.title,
      status: parsed.status,
      dueDate: parsed.dueDate ?? null,
      waitingOn: parsed.waitingOn ?? null,
      expectedUnblockDate: parsed.expectedUnblockDate ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(projects.id, id), eq(projects.workspaceId, user.workspaceId)))
    .returning({ id: projects.id, lobId: projects.lobId });

  if (!updated) return { ok: false, error: "Project not found" };

  revalidatePath(`/projects/${id}`);
  revalidatePath(`/lob/${updated.lobId}`);
  return { ok: true, id: updated.id };
}

/* ─── Milestones (attach to a Project) ──────────────────────────────────── */

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
  toUserId: string;
}): Promise<ActionResult> {
  const user = await requireUser();

  if (!(await projectInWorkspace(opts.projectId, user.workspaceId))) {
    return { ok: false, error: "Project not found" };
  }

  const [member] = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, user.workspaceId),
        eq(workspaceMembers.userId, opts.toUserId),
      ),
    )
    .limit(1);
  if (!member) {
    return { ok: false, error: "Target user is not a member of this workspace" };
  }

  const [row] = await db
    .update(milestones)
    .set({ assignedTo: opts.toUserId })
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

export async function addMilestone(opts: {
  projectId: string;
  title: string;
  dueDate?: string | null;
}): Promise<ActionResult> {
  const user = await requireUser();
  if (!opts.title.trim()) return { ok: false, error: "Title required" };

  if (!(await projectInWorkspace(opts.projectId, user.workspaceId))) {
    return { ok: false, error: "Project not found" };
  }

  const [row] = await db
    .insert(milestones)
    .values({
      projectId: opts.projectId,
      title: opts.title.trim(),
      workspaceId: user.workspaceId,
      createdBy: user.id,
      dueDate: opts.dueDate ?? null,
    })
    .returning({ id: milestones.id });

  revalidatePath(`/projects/${opts.projectId}`);
  return { ok: true, id: row.id };
}

/* ─── Project Tasks (milestones) — multi-view board/table ────────────────── */

type TaskStatus =
  | "pending"
  | "in_progress"
  | "in_review"
  | "blocked"
  | "done"
  | "cancelled";
type TaskPriority = "now" | "next" | "later" | "backlog";
type TaskBucket = "pending" | "started" | "completed";

const BUCKET_STATUS: Record<
  TaskBucket,
  Extract<TaskStatus, "pending" | "in_progress" | "done">
> = {
  pending: "pending",
  started: "in_progress",
  completed: "done",
};

async function ownedProjectId(
  projectId: string,
  workspaceId: string,
): Promise<string | null> {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
    .limit(1);
  return project?.id ?? null;
}

async function memberOrNull(
  workspaceId: string,
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId) return null;
  const [member] = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .limit(1);
  return member?.userId ?? null;
}

export async function addProjectTask(opts: {
  projectId: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority | null;
  assignedTo?: string | null;
  status?: TaskStatus;
}): Promise<ActionResult> {
  const user = await requireUser();
  if (!opts.title.trim()) return { ok: false, error: "Title required" };
  if (!(await ownedProjectId(opts.projectId, user.workspaceId))) {
    return { ok: false, error: "Project not found" };
  }

  const status = opts.status ?? "pending";
  const [row] = await db
    .insert(milestones)
    .values({
      projectId: opts.projectId,
      title: opts.title.trim(),
      description: opts.description?.trim() || null,
      workspaceId: user.workspaceId,
      createdBy: user.id,
      dueDate: opts.dueDate || null,
      priority: opts.priority ?? null,
      assignedTo: await memberOrNull(user.workspaceId, opts.assignedTo),
      status,
      completedAt: status === "done" ? new Date() : null,
    })
    .returning({ id: milestones.id });

  revalidatePath(`/projects/${opts.projectId}`);
  return { ok: true, id: row.id };
}

export async function updateProjectTask(opts: {
  taskId: string;
  projectId: string;
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority | null;
  assignedTo?: string | null;
  status?: TaskStatus;
}): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await ownedProjectId(opts.projectId, user.workspaceId))) {
    return { ok: false, error: "Project not found" };
  }

  const patch: Partial<typeof milestones.$inferInsert> = {};
  if (opts.title !== undefined) {
    if (!opts.title.trim()) return { ok: false, error: "Title required" };
    patch.title = opts.title.trim();
  }
  if (opts.description !== undefined) {
    patch.description = opts.description?.trim() || null;
  }
  if (opts.dueDate !== undefined) patch.dueDate = opts.dueDate || null;
  if (opts.priority !== undefined) patch.priority = opts.priority;
  if (opts.assignedTo !== undefined) {
    patch.assignedTo = await memberOrNull(user.workspaceId, opts.assignedTo);
  }
  if (opts.status !== undefined) {
    patch.status = opts.status;
    patch.completedAt = opts.status === "done" ? new Date() : null;
  }
  if (Object.keys(patch).length === 0) return { ok: true, id: opts.taskId };

  const [row] = await db
    .update(milestones)
    .set(patch)
    .where(
      and(
        eq(milestones.id, opts.taskId),
        eq(milestones.projectId, opts.projectId),
        eq(milestones.workspaceId, user.workspaceId),
      ),
    )
    .returning({ id: milestones.id });
  if (!row) return { ok: false, error: "Task not found" };
  revalidatePath(`/projects/${opts.projectId}`);
  return { ok: true, id: row.id };
}

export async function moveTaskBucket(opts: {
  taskId: string;
  projectId: string;
  bucket: TaskBucket;
}): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await ownedProjectId(opts.projectId, user.workspaceId))) {
    return { ok: false, error: "Project not found" };
  }

  const status = BUCKET_STATUS[opts.bucket];
  const [row] = await db
    .update(milestones)
    .set({ status, completedAt: status === "done" ? new Date() : null })
    .where(
      and(
        eq(milestones.id, opts.taskId),
        eq(milestones.projectId, opts.projectId),
        eq(milestones.workspaceId, user.workspaceId),
      ),
    )
    .returning({ id: milestones.id });
  if (!row) return { ok: false, error: "Task not found" };
  revalidatePath(`/projects/${opts.projectId}`);
  return { ok: true, id: row.id };
}
