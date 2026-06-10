"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";
import {
  parseProjectFormData,
  type ProjectFormInput,
} from "@/lib/validation/lob";
import {
  createProjectLink,
  updateProjectLink,
  deleteProjectLink,
  reorderProjectLinks,
  createProjectFile,
  getProjectLinkById,
  recordLinkAudit,
  setBusinessLinks,
  type ProjectLinkCategory,
} from "@/db/queries/lines-of-business";
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

const { linesOfBusiness, projectContacts, pipelineStages } = schema;

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

async function syncContactLinks(lobId: string, contactIds: string[]) {
  await db.delete(projectContacts).where(eq(projectContacts.lobId, lobId));
  if (contactIds.length === 0) return;
  await db
    .insert(projectContacts)
    .values(
      contactIds.map((contactId, i) => ({
        lobId,
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

export async function createLob(
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
    .insert(linesOfBusiness)
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
    .returning({ id: linesOfBusiness.id });

  await syncContactLinks(inserted.id, parsed.contactIds);
  // New LoBs default kind='project'; link them to the chosen businesses.
  if (parsed.businessIds.length > 0) {
    await setBusinessLinks({
      workspaceId: user.workspaceId,
      projectLobId: inserted.id,
      businessIds: parsed.businessIds,
    });
  }

  revalidatePath("/lob");
  redirect(`/lob/${inserted.id}`);
}

export async function updateLob(
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
    .update(linesOfBusiness)
    .set({
      title: parsed.title,
      status: parsed.status,
      dueDate: parsed.dueDate ?? null,
      waitingOn: parsed.waitingOn ?? null,
      expectedUnblockDate: parsed.expectedUnblockDate ?? null,
      notesPath: parsed.notesPath ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(linesOfBusiness.id, id), eq(linesOfBusiness.workspaceId, user.workspaceId)),
    )
    .returning({ id: linesOfBusiness.id });

  if (!updated) return { ok: false, error: "Business or project not found" };

  await syncContactLinks(updated.id, parsed.contactIds);
  // Replace-set business links; setBusinessLinks no-ops with an error for
  // kind='business' rows (the form only offers the checkboxes for projects).
  const linkRes = await setBusinessLinks({
    workspaceId: user.workspaceId,
    projectLobId: updated.id,
    businessIds: parsed.businessIds,
  });
  if (!linkRes.ok && parsed.businessIds.length > 0) {
    return { ok: false, error: linkRes.error };
  }

  revalidatePath("/lob");
  revalidatePath(`/lob/${id}`);
  return { ok: true, id: updated.id };
}

export async function advanceLobStage(opts: {
  lobId: string;
  toStageId: string;
}): Promise<ActionResult> {
  const user = await requireUser();

  // Verify ownership + that the target stage belongs to the LoB's template.
  const [lob] = await db
    .select()
    .from(linesOfBusiness)
    .where(
      and(
        eq(linesOfBusiness.id, opts.lobId),
        eq(linesOfBusiness.workspaceId, user.workspaceId),
      ),
    )
    .limit(1);
  if (!lob) return { ok: false, error: "Line of business not found" };
  if (!lob.templateId) return { ok: false, error: "No pipeline template" };

  const [stage] = await db
    .select()
    .from(pipelineStages)
    .where(
      and(
        eq(pipelineStages.id, opts.toStageId),
        eq(pipelineStages.templateId, lob.templateId),
      ),
    )
    .limit(1);
  if (!stage) return { ok: false, error: "Stage not on this pipeline template" };

  await db
    .update(linesOfBusiness)
    .set({ currentStageId: stage.id, updatedAt: new Date() })
    .where(eq(linesOfBusiness.id, opts.lobId));

  revalidatePath("/pipeline");
  revalidatePath(`/lob/${opts.lobId}`);
  return { ok: true, id: opts.lobId };
}

/* ─── LoB links (FR-DOC-1/2/4/5/6/9/11) ─────────────────────────────────── */

async function assertLobInWorkspace(
  lobId: string,
  workspaceId: string,
): Promise<boolean> {
  const [lob] = await db
    .select({ id: linesOfBusiness.id })
    .from(linesOfBusiness)
    .where(and(eq(linesOfBusiness.id, lobId), eq(linesOfBusiness.workspaceId, workspaceId)))
    .limit(1);
  return Boolean(lob);
}

/**
 * FR-DOC-9 — member may mutate only links they created; admin/owner may mutate
 * any link in the workspace.
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
  lobId: string;
  url: string;
  label?: string;
  category?: string;
  description?: string | null;
}): Promise<ActionResult> {
  const user = await requireUser();

  if (!(await assertLobInWorkspace(opts.lobId, user.workspaceId))) {
    return { ok: false, error: "Line of business not found" };
  }

  const validation = validateLinkUrl(opts.url);
  if (!validation.ok) return { ok: false, error: validation.error };
  const url = validation.url;

  const label = (opts.label ?? "").trim() || brandForUrl(url) || url;
  const category = normalizeCategory(opts.category, url);

  const row = await createProjectLink({
    workspaceId: user.workspaceId,
    lobId: opts.lobId,
    actorId: user.id,
    label,
    url,
    category,
    description: opts.description?.trim() || null,
  });

  revalidatePath(`/lob/${opts.lobId}`);
  revalidatePath("/lob");
  return { ok: true, id: row.id };
}

export async function updateLinkAction(opts: {
  lobId: string;
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
    lobId: opts.lobId,
    actorId: user.id,
    linkId: opts.linkId,
    url,
    label: opts.label?.trim() || undefined,
    category,
    description: opts.description === undefined ? undefined : opts.description?.trim() || null,
  });

  revalidatePath(`/lob/${opts.lobId}`);
  revalidatePath("/lob");
  return { ok: true, id: row.id };
}

export async function deleteLinkAction(opts: {
  lobId: string;
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
    lobId: opts.lobId,
    actorId: user.id,
    linkId: opts.linkId,
  });

  revalidatePath(`/lob/${opts.lobId}`);
  revalidatePath("/lob");
  return { ok: true, id: opts.linkId };
}

export async function reorderLinksAction(opts: {
  lobId: string;
  category: string;
  orderedLinkIds: string[];
}): Promise<ActionResult> {
  const user = await requireUser();

  if (!(await assertLobInWorkspace(opts.lobId, user.workspaceId))) {
    return { ok: false, error: "Line of business not found" };
  }
  if (!LINK_CATEGORIES.includes(opts.category as ProjectLinkCategory)) {
    return { ok: false, error: "Invalid category" };
  }

  await reorderProjectLinks({
    workspaceId: user.workspaceId,
    lobId: opts.lobId,
    actorId: user.id,
    category: opts.category as ProjectLinkCategory,
    orderedLinkIds: opts.orderedLinkIds,
  });

  revalidatePath(`/lob/${opts.lobId}`);
  return { ok: true, id: opts.lobId };
}

/* ─── LoB file uploads (Step 2 — FR-DOC-13..19) ─────────────────────────── */

export type UploadUrlResult =
  | { ok: true; path: string; token: string; signedUrl: string }
  | { ok: false; error: string };

export async function createUploadUrlAction(opts: {
  lobId: string;
  filename: string;
  mime: string;
  sizeBytes: number;
}): Promise<UploadUrlResult> {
  const user = await requireUser();

  if (!(await assertLobInWorkspace(opts.lobId, user.workspaceId))) {
    return { ok: false, error: "Line of business not found" };
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
    lobId: opts.lobId,
    originalFilename: opts.filename,
  });
  const signed = await createSignedUploadUrl(path);
  if (!signed.ok) return { ok: false, error: signed.error };
  return { ok: true, ...signed.data };
}

export async function finalizeFileUploadAction(opts: {
  lobId: string;
  storagePath: string;
  originalFilename: string;
  mime: string;
  sizeBytes: number;
  label?: string;
  category?: string;
}): Promise<ActionResult> {
  const user = await requireUser();

  if (!(await assertLobInWorkspace(opts.lobId, user.workspaceId))) {
    await removeObjects([opts.storagePath]);
    return { ok: false, error: "Line of business not found" };
  }
  // Path must live under this workspace's prefix — guards against a forged path.
  if (!opts.storagePath.startsWith(`${user.workspaceId}/${opts.lobId}/`)) {
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
    lobId: opts.lobId,
    actorId: user.id,
    label,
    category,
    storagePath: opts.storagePath,
    mimeType: canonicalMime(opts.originalFilename, opts.mime),
    sizeBytes: opts.sizeBytes,
    originalFilename: opts.originalFilename,
  });

  revalidatePath(`/lob/${opts.lobId}`);
  revalidatePath("/lob");
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
      lobId: link.lobId,
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

export async function deleteFileAction(opts: {
  lobId: string;
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
    lobId: opts.lobId,
    actorId: user.id,
    linkId: opts.linkId,
  });

  if (link.storagePath) {
    const { failed } = await removeObjects([link.storagePath]);
    if (failed.length > 0) {
      await recordLinkAudit({
        workspaceId: user.workspaceId,
        lobId: opts.lobId,
        linkId: opts.linkId,
        actorId: user.id,
        action: "storage_orphan",
        before: { storagePath: link.storagePath },
      });
    }
  }

  revalidatePath(`/lob/${opts.lobId}`);
  revalidatePath("/lob");
  return { ok: true, id: opts.linkId };
}
