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
import {
  createProjectLink,
  updateProjectLink,
  deleteProjectLink,
  reorderProjectLinks,
  createProjectFile,
  getProjectLinkById,
  recordLinkAudit,
  type ProjectLinkCategory,
} from "@/db/queries/projects";
import { validateLinkUrl } from "@/lib/project-links/validate";
import { detectCategory } from "@/lib/project-links/detect-category";
import { brandForUrl } from "@/lib/project-links/host-brands";
import {
  isAllowedUpload,
  canonicalMime,
  REJECT_MESSAGE,
} from "@/lib/project-files/allowed-types";
import { maxUploadBytes, tooLargeMessage } from "@/lib/project-files/limits";
import { sniffConsistent } from "@/lib/project-files/sniff";
import {
  buildStoragePath,
  createSignedUploadUrl,
  createSignedDownloadUrl,
  objectExists,
  sniffHeadBytes,
  removeObjects,
} from "@/lib/project-files/storage";

const { projects, projectContacts, pipelineStages } = schema;

const LINK_CATEGORIES: ProjectLinkCategory[] = [
  "business",
  "marketing",
  "tech",
  "ops",
  "design",
  "finance",
  "other",
];

function normalizeCategory(raw: unknown, url: string): ProjectLinkCategory {
  if (typeof raw === "string" && LINK_CATEGORIES.includes(raw as ProjectLinkCategory)) {
    return raw as ProjectLinkCategory;
  }
  return detectCategory(url);
}

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
      workspaceId: user.workspaceId,
      dueDate: parsed.dueDate ?? null,
      waitingOn: parsed.waitingOn ?? null,
      expectedUnblockDate: parsed.expectedUnblockDate ?? null,
      notesPath: parsed.notesPath ?? null,
      createdBy: user.id,
    })
    .returning({ id: projects.id });

  await syncContactLinks(inserted.id, parsed.contactIds);

  if (parsed.templateId) {
    await instantiateMilestonesFromTemplate({
      projectId: inserted.id,
      templateId: parsed.templateId,
      workspaceId: user.workspaceId,
      createdBy: user.id,
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
    .where(and(eq(projects.id, id), eq(projects.workspaceId, user.workspaceId)))
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
  toUserId: string;
}): Promise<ActionResult> {
  const user = await requireUser();

  // Verify the project belongs to this workspace.
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, opts.projectId),
        eq(projects.workspaceId, user.workspaceId),
      ),
    )
    .limit(1);
  if (!project) return { ok: false, error: "Project not found" };

  // Verify the target user is a member of this workspace.
  const { milestones, workspaceMembers } = schema;
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

export async function advanceProjectStage(opts: {
  projectId: string;
  toStageId: string;
}): Promise<ActionResult> {
  const user = await requireUser();

  // Verify ownership + that the target stage belongs to the project's template.
  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, opts.projectId),
        eq(projects.workspaceId, user.workspaceId),
      ),
    )
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
    .where(
      and(
        eq(projects.id, opts.projectId),
        eq(projects.workspaceId, user.workspaceId),
      ),
    )
    .limit(1);
  if (!project) return { ok: false, error: "Project not found" };

  const { milestones } = schema;
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

const BUCKET_STATUS: Record<TaskBucket, Extract<TaskStatus, "pending" | "in_progress" | "done">> = {
  pending: "pending",
  started: "in_progress",
  completed: "done",
};

/** Confirm a project exists in the caller's workspace; returns its id or null. */
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

/** Returns the userId if it belongs to the workspace, otherwise null. */
async function memberOrNull(
  workspaceId: string,
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId) return null;
  const { workspaceMembers } = schema;
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
  if (!(await ownedProjectId(opts.projectId, user.workspaceId)))
    return { ok: false, error: "Project not found" };

  const status = opts.status ?? "pending";
  const { milestones } = schema;
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
  if (!(await ownedProjectId(opts.projectId, user.workspaceId)))
    return { ok: false, error: "Project not found" };

  const { milestones } = schema;
  const patch: Partial<typeof milestones.$inferInsert> = {};
  if (opts.title !== undefined) {
    if (!opts.title.trim()) return { ok: false, error: "Title required" };
    patch.title = opts.title.trim();
  }
  if (opts.description !== undefined)
    patch.description = opts.description?.trim() || null;
  if (opts.dueDate !== undefined) patch.dueDate = opts.dueDate || null;
  if (opts.priority !== undefined) patch.priority = opts.priority;
  if (opts.assignedTo !== undefined)
    patch.assignedTo = await memberOrNull(user.workspaceId, opts.assignedTo);
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

/** Move a task between the Pending / Started / Completed buckets (drag-drop). */
export async function moveTaskBucket(opts: {
  taskId: string;
  projectId: string;
  bucket: TaskBucket;
}): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await ownedProjectId(opts.projectId, user.workspaceId)))
    return { ok: false, error: "Project not found" };

  const status = BUCKET_STATUS[opts.bucket];
  const { milestones } = schema;
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

/* ─── Project links (FR-DOC-1/2/4/5/6/9/11) ─────────────────────────────── */

async function assertProjectInWorkspace(
  projectId: string,
  workspaceId: string,
): Promise<boolean> {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
    .limit(1);
  return Boolean(project);
}

/**
 * FR-DOC-9 — member may mutate only links they created; admin/owner may mutate
 * any link in the workspace. Returns the link's createdBy for callers that need
 * it, or null if the link is absent / cross-workspace.
 */
async function canMutateLink(
  user: { id: string; workspaceId: string; workspaceRole: string },
  linkId: string,
): Promise<{ allowed: boolean; found: boolean }> {
  const [link] = await db
    .select({
      createdBy: schema.projectLinks.createdBy,
      workspaceId: schema.projectLinks.workspaceId,
    })
    .from(schema.projectLinks)
    .where(eq(schema.projectLinks.id, linkId))
    .limit(1);
  if (!link || link.workspaceId !== user.workspaceId) {
    return { allowed: false, found: false };
  }
  const isPrivileged =
    user.workspaceRole === "owner" || user.workspaceRole === "admin";
  return { allowed: isPrivileged || link.createdBy === user.id, found: true };
}

export async function createLinkAction(opts: {
  projectId: string;
  url: string;
  label?: string;
  category?: string;
  description?: string | null;
}): Promise<ActionResult> {
  const user = await requireUser();

  if (!(await assertProjectInWorkspace(opts.projectId, user.workspaceId))) {
    return { ok: false, error: "Project not found" };
  }

  const validation = validateLinkUrl(opts.url);
  if (!validation.ok) return { ok: false, error: validation.error };
  const url = validation.url;

  const label = (opts.label ?? "").trim() || brandForUrl(url) || url;
  const category = normalizeCategory(opts.category, url);

  const row = await createProjectLink({
    workspaceId: user.workspaceId,
    projectId: opts.projectId,
    actorId: user.id,
    label,
    url,
    category,
    description: opts.description?.trim() || null,
  });

  revalidatePath(`/projects/${opts.projectId}`);
  revalidatePath("/projects");
  return { ok: true, id: row.id };
}

export async function updateLinkAction(opts: {
  projectId: string;
  linkId: string;
  url?: string;
  label?: string;
  category?: string;
  description?: string | null;
}): Promise<ActionResult> {
  const user = await requireUser();

  const perm = await canMutateLink(user, opts.linkId);
  if (!perm.found) return { ok: false, error: "Link not found" };
  if (!perm.allowed) {
    return { ok: false, error: "You can only edit links you created" };
  }

  let url: string | undefined;
  if (opts.url !== undefined) {
    const validation = validateLinkUrl(opts.url);
    if (!validation.ok) return { ok: false, error: validation.error };
    url = validation.url;
  }

  const category =
    opts.category !== undefined && LINK_CATEGORIES.includes(opts.category as ProjectLinkCategory)
      ? (opts.category as ProjectLinkCategory)
      : undefined;

  const row = await updateProjectLink({
    workspaceId: user.workspaceId,
    projectId: opts.projectId,
    actorId: user.id,
    linkId: opts.linkId,
    url,
    label: opts.label?.trim() || undefined,
    category,
    description: opts.description === undefined ? undefined : opts.description?.trim() || null,
  });

  revalidatePath(`/projects/${opts.projectId}`);
  revalidatePath("/projects");
  return { ok: true, id: row.id };
}

export async function deleteLinkAction(opts: {
  projectId: string;
  linkId: string;
}): Promise<ActionResult> {
  const user = await requireUser();

  const perm = await canMutateLink(user, opts.linkId);
  if (!perm.found) return { ok: false, error: "Link not found" };
  if (!perm.allowed) {
    return { ok: false, error: "You can only delete links you created" };
  }

  await deleteProjectLink({
    workspaceId: user.workspaceId,
    projectId: opts.projectId,
    actorId: user.id,
    linkId: opts.linkId,
  });

  revalidatePath(`/projects/${opts.projectId}`);
  revalidatePath("/projects");
  return { ok: true, id: opts.linkId };
}

export async function reorderLinksAction(opts: {
  projectId: string;
  category: string;
  orderedLinkIds: string[];
}): Promise<ActionResult> {
  const user = await requireUser();

  if (!(await assertProjectInWorkspace(opts.projectId, user.workspaceId))) {
    return { ok: false, error: "Project not found" };
  }
  if (!LINK_CATEGORIES.includes(opts.category as ProjectLinkCategory)) {
    return { ok: false, error: "Invalid category" };
  }

  await reorderProjectLinks({
    workspaceId: user.workspaceId,
    projectId: opts.projectId,
    actorId: user.id,
    category: opts.category as ProjectLinkCategory,
    orderedLinkIds: opts.orderedLinkIds,
  });

  revalidatePath(`/projects/${opts.projectId}`);
  return { ok: true, id: opts.projectId };
}

/* ─── Project file uploads (Step 2 — FR-DOC-13..19) ─────────────────────── */

export type UploadUrlResult =
  | { ok: true; path: string; token: string; signedUrl: string }
  | { ok: false; error: string };

/**
 * FR-DOC-13/15/16 — validate permission + allow-list + size, then issue a
 * direct-to-Supabase signed upload URL (browser → Storage, bypassing the
 * Vercel function payload limit).
 */
export async function createUploadUrlAction(opts: {
  projectId: string;
  filename: string;
  mime: string;
  sizeBytes: number;
}): Promise<UploadUrlResult> {
  const user = await requireUser();

  if (!(await assertProjectInWorkspace(opts.projectId, user.workspaceId))) {
    return { ok: false, error: "Project not found" };
  }
  if (!isAllowedUpload(opts.filename, opts.mime)) {
    return { ok: false, error: REJECT_MESSAGE };
  }
  if (!Number.isFinite(opts.sizeBytes) || opts.sizeBytes <= 0) {
    return { ok: false, error: "Invalid file" };
  }
  if (opts.sizeBytes > maxUploadBytes()) {
    return { ok: false, error: tooLargeMessage() };
  }

  const path = buildStoragePath({
    workspaceId: user.workspaceId,
    projectId: opts.projectId,
    originalFilename: opts.filename,
  });
  const signed = await createSignedUploadUrl(path);
  if (!signed.ok) return { ok: false, error: signed.error };
  return { ok: true, ...signed.data };
}

/**
 * FR-DOC-13/15 — after the browser finishes the direct upload, confirm the
 * object landed, sniff its first bytes (defeats extension spoofing), then
 * record the metadata row. On any failure the orphaned object is removed.
 */
export async function finalizeFileUploadAction(opts: {
  projectId: string;
  storagePath: string;
  originalFilename: string;
  mime: string;
  sizeBytes: number;
  label?: string;
  category?: string;
}): Promise<ActionResult> {
  const user = await requireUser();

  if (!(await assertProjectInWorkspace(opts.projectId, user.workspaceId))) {
    await removeObjects([opts.storagePath]);
    return { ok: false, error: "Project not found" };
  }
  // Path must live under this workspace's prefix — guards against a forged path.
  if (!opts.storagePath.startsWith(`${user.workspaceId}/${opts.projectId}/`)) {
    await removeObjects([opts.storagePath]);
    return { ok: false, error: "Invalid storage path" };
  }
  if (!isAllowedUpload(opts.originalFilename, opts.mime)) {
    await removeObjects([opts.storagePath]);
    return { ok: false, error: REJECT_MESSAGE };
  }
  if (opts.sizeBytes > maxUploadBytes()) {
    await removeObjects([opts.storagePath]);
    return { ok: false, error: tooLargeMessage() };
  }

  if (!(await objectExists(opts.storagePath))) {
    return { ok: false, error: "Upload did not complete — please retry" };
  }

  const head = await sniffHeadBytes(opts.storagePath);
  if (!head) {
    await removeObjects([opts.storagePath]);
    return { ok: false, error: "Could not verify uploaded file" };
  }
  const sniff = sniffConsistent(opts.originalFilename, head);
  if (!sniff.ok) {
    await removeObjects([opts.storagePath]);
    return { ok: false, error: sniff.reason };
  }

  const category: ProjectLinkCategory =
    opts.category && LINK_CATEGORIES.includes(opts.category as ProjectLinkCategory)
      ? (opts.category as ProjectLinkCategory)
      : "other";
  const label =
    (opts.label ?? "").trim() ||
    opts.originalFilename.replace(/\.[a-z0-9]+$/i, "") ||
    opts.originalFilename;

  const row = await createProjectFile({
    workspaceId: user.workspaceId,
    projectId: opts.projectId,
    actorId: user.id,
    label,
    category,
    storagePath: opts.storagePath,
    mimeType: canonicalMime(opts.originalFilename, opts.mime),
    sizeBytes: opts.sizeBytes,
    originalFilename: opts.originalFilename,
  });

  revalidatePath(`/projects/${opts.projectId}`);
  revalidatePath("/projects");
  return { ok: true, id: row.id };
}

export type SignedUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/** FR-DOC-18 — generate a 1-hour signed download URL on click. */
export async function getFileSignedUrlAction(opts: {
  linkId: string;
}): Promise<SignedUrlResult> {
  const user = await requireUser();
  const link = await getProjectLinkById({
    linkId: opts.linkId,
    workspaceId: user.workspaceId,
  });
  if (!link) return { ok: false, error: "Not found" };
  if (link.kind !== "file" || !link.storagePath) {
    return { ok: false, error: "Not a file" };
  }

  if (!(await objectExists(link.storagePath))) {
    await recordLinkAudit({
      workspaceId: user.workspaceId,
      projectId: link.projectId,
      linkId: link.id,
      actorId: user.id,
      action: "file_missing",
      before: { storagePath: link.storagePath },
    });
    return { ok: false, error: "File missing — please re-upload" };
  }

  const signed = await createSignedDownloadUrl(link.storagePath);
  if (!signed.ok) return { ok: false, error: "Could not generate link" };
  return { ok: true, url: signed.url };
}

/**
 * FR-DOC-19 — delete a file link: write audit + remove the row (authoritative),
 * then best-effort remove the Storage object. A failed object removal is logged
 * as 'storage_orphan' for the reaper rather than rolling back the row delete.
 */
export async function deleteFileAction(opts: {
  projectId: string;
  linkId: string;
}): Promise<ActionResult> {
  const user = await requireUser();

  const perm = await canMutateLink(user, opts.linkId);
  if (!perm.found) return { ok: false, error: "Link not found" };
  if (!perm.allowed) {
    return { ok: false, error: "You can only delete files you uploaded" };
  }

  const link = await getProjectLinkById({
    linkId: opts.linkId,
    workspaceId: user.workspaceId,
  });
  if (!link) return { ok: false, error: "Link not found" };

  await deleteProjectLink({
    workspaceId: user.workspaceId,
    projectId: opts.projectId,
    actorId: user.id,
    linkId: opts.linkId,
  });

  if (link.storagePath) {
    const { failed } = await removeObjects([link.storagePath]);
    if (failed.length > 0) {
      await recordLinkAudit({
        workspaceId: user.workspaceId,
        projectId: opts.projectId,
        linkId: opts.linkId,
        actorId: user.id,
        action: "storage_orphan",
        before: { storagePath: link.storagePath },
      });
    }
  }

  revalidatePath(`/projects/${opts.projectId}`);
  revalidatePath("/projects");
  return { ok: true, id: opts.linkId };
}
