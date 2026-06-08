import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const { meetingMaterials, projectLinks, linesOfBusiness } = schema;

export type MaterialKind = (typeof schema.projectLinkKind.enumValues)[number];

/** A material attached to a meeting, enriched with the underlying link content. */
export type MeetingMaterial = {
  projectLinkId: string;
  sortOrder: number;
  kind: MaterialKind;
  label: string;
  url: string | null;
  description: string | null;
  category: string;
  storagePath: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  originalFilename: string | null;
  lobId: string;
  lobTitle: string | null;
};

/** Materials curated for a meeting, in presentation order. */
export async function listMeetingMaterials(opts: {
  meetingId: string;
  workspaceId: string;
}): Promise<MeetingMaterial[]> {
  const rows = await db
    .select({
      projectLinkId: meetingMaterials.projectLinkId,
      sortOrder: meetingMaterials.sortOrder,
      kind: projectLinks.kind,
      label: projectLinks.label,
      url: projectLinks.url,
      description: projectLinks.description,
      category: projectLinks.category,
      storagePath: projectLinks.storagePath,
      mimeType: projectLinks.mimeType,
      sizeBytes: projectLinks.sizeBytes,
      originalFilename: projectLinks.originalFilename,
      lobId: projectLinks.lobId,
      lobTitle: linesOfBusiness.title,
    })
    .from(meetingMaterials)
    .innerJoin(projectLinks, eq(projectLinks.id, meetingMaterials.projectLinkId))
    .leftJoin(linesOfBusiness, eq(linesOfBusiness.id, projectLinks.lobId))
    .where(
      and(
        eq(meetingMaterials.meetingId, opts.meetingId),
        eq(meetingMaterials.workspaceId, opts.workspaceId),
      ),
    )
    .orderBy(asc(meetingMaterials.sortOrder));
  return rows;
}

/** A material the user could attach, grouped under its LoB in the picker. */
export type AttachableMaterial = {
  projectLinkId: string;
  kind: MaterialKind;
  label: string;
  category: string;
  url: string | null;
  mimeType: string | null;
  originalFilename: string | null;
  lobId: string;
  lobTitle: string | null;
  attached: boolean;
};

/**
 * Every shareable project_link in the workspace (decks, files, docs, links —
 * not bare legacy notes), flagged with whether it's already attached to this
 * meeting. Drives the "attach material" picker.
 */
export async function listAttachableMaterials(opts: {
  meetingId: string;
  workspaceId: string;
}): Promise<AttachableMaterial[]> {
  const attachedRows = await db
    .select({ id: meetingMaterials.projectLinkId })
    .from(meetingMaterials)
    .where(
      and(
        eq(meetingMaterials.meetingId, opts.meetingId),
        eq(meetingMaterials.workspaceId, opts.workspaceId),
      ),
    );
  const attachedSet = new Set(attachedRows.map((r) => r.id));

  const rows = await db
    .select({
      projectLinkId: projectLinks.id,
      kind: projectLinks.kind,
      label: projectLinks.label,
      category: projectLinks.category,
      url: projectLinks.url,
      mimeType: projectLinks.mimeType,
      originalFilename: projectLinks.originalFilename,
      lobId: projectLinks.lobId,
      lobTitle: linesOfBusiness.title,
    })
    .from(projectLinks)
    .leftJoin(linesOfBusiness, eq(linesOfBusiness.id, projectLinks.lobId))
    .where(
      and(
        eq(projectLinks.workspaceId, opts.workspaceId),
        // bare text-only "note" rows aren't presentable materials
        sql`${projectLinks.kind} <> 'note'`,
      ),
    )
    .orderBy(asc(linesOfBusiness.title), asc(projectLinks.label));

  return rows.map((r) => ({ ...r, attached: attachedSet.has(r.projectLinkId) }));
}

/** Attach a material, appended to the end of the presentation order. */
export async function addMeetingMaterial(input: {
  meetingId: string;
  projectLinkId: string;
  workspaceId: string;
  addedBy: string;
}): Promise<void> {
  // Guard: the link must belong to the same workspace.
  const [link] = await db
    .select({ id: projectLinks.id })
    .from(projectLinks)
    .where(
      and(
        eq(projectLinks.id, input.projectLinkId),
        eq(projectLinks.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!link) throw new Error("Material not found in this workspace");

  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${meetingMaterials.sortOrder}), -1)` })
    .from(meetingMaterials)
    .where(eq(meetingMaterials.meetingId, input.meetingId));

  await db
    .insert(meetingMaterials)
    .values({
      meetingId: input.meetingId,
      projectLinkId: input.projectLinkId,
      workspaceId: input.workspaceId,
      sortOrder: (max ?? -1) + 1,
      addedBy: input.addedBy,
    })
    .onConflictDoNothing();
}

/** Detach a material from a meeting. */
export async function removeMeetingMaterial(input: {
  meetingId: string;
  projectLinkId: string;
  workspaceId: string;
}): Promise<void> {
  await db
    .delete(meetingMaterials)
    .where(
      and(
        eq(meetingMaterials.meetingId, input.meetingId),
        eq(meetingMaterials.projectLinkId, input.projectLinkId),
        eq(meetingMaterials.workspaceId, input.workspaceId),
      ),
    );
}

/**
 * Persist a new presentation order. `orderedLinkIds` is the full list of
 * attached link ids in the desired order; each gets its index as sort_order.
 */
export async function reorderMeetingMaterials(input: {
  meetingId: string;
  workspaceId: string;
  orderedLinkIds: string[];
}): Promise<void> {
  if (input.orderedLinkIds.length === 0) return;
  await db.transaction(async (tx) => {
    for (let i = 0; i < input.orderedLinkIds.length; i++) {
      await tx
        .update(meetingMaterials)
        .set({ sortOrder: i })
        .where(
          and(
            eq(meetingMaterials.meetingId, input.meetingId),
            eq(meetingMaterials.projectLinkId, input.orderedLinkIds[i]),
            eq(meetingMaterials.workspaceId, input.workspaceId),
          ),
        );
    }
  });
}
