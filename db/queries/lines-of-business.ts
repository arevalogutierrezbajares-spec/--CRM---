import { and, asc, desc, eq, inArray, sql as rawSql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { computeHealth, type HealthColor } from "@/lib/health";

const {
  linesOfBusiness,
  lobBusinessLinks,
  projects,
  projectContacts,
  contacts,
  pipelineTemplates,
  pipelineStages,
  milestones,
} = schema;

type MilestoneStatus = (typeof milestones.$inferSelect)["status"];

export type LobRow = typeof linesOfBusiness.$inferSelect;
export type LobListItem = LobRow & {
  contactCount: number;
  projectCount: number;
  milestoneOpenCount: number;
  milestoneOverdueCount: number;
  milestoneTotalCount: number;
  milestoneDoneCount: number;
  milestoneProgressPct: number;
  templateName: string | null;
  computedHealth: HealthColor;
  /** Folder-tree preview: { category: ["link label", ...] } */
  linkPreview: Record<string, string[]>;
};

export async function listLines(opts: {
  workspaceId: string;
  status?: "active" | "waiting" | "done" | "lost";
  /** Restrict to businesses or projects (omit for both). */
  kind?: "business" | "project";
  /** Default true: hide child LoBs (sub-modules) from the gallery */
  topLevelOnly?: boolean;
  /** Restrict to children of this parent (used when listing modules) */
  parentId?: string;
}): Promise<LobListItem[]> {
  const conditions = [eq(linesOfBusiness.workspaceId, opts.workspaceId)];
  if (opts.status) conditions.push(eq(linesOfBusiness.status, opts.status));
  if (opts.kind) conditions.push(eq(linesOfBusiness.kind, opts.kind));
  if (opts.parentId) {
    conditions.push(eq(linesOfBusiness.parentLobId, opts.parentId));
  } else if (opts.topLevelOnly !== false) {
    conditions.push(rawSql`${linesOfBusiness.parentLobId} IS NULL`);
  }

  const rows = await db
    .select({
      lob: linesOfBusiness,
      templateName: pipelineTemplates.name,
    })
    .from(linesOfBusiness)
    .leftJoin(pipelineTemplates, eq(pipelineTemplates.id, linesOfBusiness.templateId))
    .where(and(...conditions))
    .orderBy(desc(linesOfBusiness.updatedAt));

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.lob.id);

  // Child projects map (lobId -> projectIds) so milestones can roll up.
  const childProjects = await db
    .select({ id: projects.id, lobId: projects.lobId })
    .from(projects)
    .where(inArray(projects.lobId, ids));
  const projectIdToLob = new Map(childProjects.map((p) => [p.id, p.lobId]));
  const projectIds = childProjects.map((p) => p.id);

  const [contactCounts, allMs] = await Promise.all([
    db
      .select({
        lobId: projectContacts.lobId,
        contactId: projectContacts.contactId,
      })
      .from(projectContacts)
      .where(inArray(projectContacts.lobId, ids)),
    projectIds.length
      ? db
          .select({
            projectId: milestones.projectId,
            status: milestones.status,
            dueDate: milestones.dueDate,
          })
          .from(milestones)
          .where(inArray(milestones.projectId, projectIds))
      : Promise.resolve(
          [] as { projectId: string; status: MilestoneStatus; dueDate: string | null }[],
        ),
  ]);

  // Milestones grouped by the LoB they roll up to.
  const msByLob = new Map<string, { status: MilestoneStatus; dueDate: string | null }[]>();
  for (const m of allMs) {
    const lobId = projectIdToLob.get(m.projectId);
    if (!lobId) continue;
    (msByLob.get(lobId) ?? msByLob.set(lobId, []).get(lobId)!).push({
      status: m.status,
      dueDate: m.dueDate,
    });
  }

  // Per-LoB link counts grouped by category (for card hover preview)
  const linkRows = await db
    .select({
      lobId: schema.projectLinks.lobId,
      category: schema.projectLinks.category,
      label: schema.projectLinks.label,
    })
    .from(schema.projectLinks)
    .where(inArray(schema.projectLinks.lobId, ids));

  const today = new Date().toISOString().slice(0, 10);

  return rows.map(({ lob, templateName }) => {
    const lobMs = msByLob.get(lob.id) ?? [];
    const computedHealth = computeHealth({
      status: lob.status,
      expectedUnblockDate: lob.expectedUnblockDate,
      milestones: lobMs.map((m) => ({
        status: m.status,
        dueDate: m.dueDate,
      })),
    });
    const total = lobMs.length;
    const doneCount = lobMs.filter((m) => m.status === "done").length;

    // Build folder structure: { category: string[] (labels) }
    const linkPreview: Record<string, string[]> = {};
    for (const l of linkRows) {
      if (l.lobId !== lob.id) continue;
      (linkPreview[l.category] ??= []).push(l.label);
    }

    return {
      ...lob,
      templateName,
      contactCount: contactCounts.filter((c) => c.lobId === lob.id).length,
      projectCount: childProjects.filter((p) => p.lobId === lob.id).length,
      milestoneOpenCount: lobMs.filter((m) => m.status !== "done").length,
      milestoneOverdueCount: lobMs.filter(
        (m) => m.status !== "done" && m.dueDate && m.dueDate < today,
      ).length,
      milestoneTotalCount: total,
      milestoneDoneCount: doneCount,
      milestoneProgressPct: total === 0 ? 0 : Math.round((doneCount / total) * 100),
      computedHealth,
      linkPreview,
    };
  });
}

export async function getLob(opts: { id: string; workspaceId: string }) {
  const [row] = await db
    .select({
      lob: linesOfBusiness,
      templateName: pipelineTemplates.name,
    })
    .from(linesOfBusiness)
    .leftJoin(pipelineTemplates, eq(pipelineTemplates.id, linesOfBusiness.templateId))
    .where(
      and(eq(linesOfBusiness.id, opts.id), eq(linesOfBusiness.workspaceId, opts.workspaceId)),
    )
    .limit(1);

  if (!row) return null;

  // Child projects of this LoB, and milestones rolled up across them.
  const childProjects = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.lobId, row.lob.id));
  const childIds = childProjects.map((p) => p.id);

  const [linkedContacts, stages, rollupMilestones] = await Promise.all([
    db
      .select({ contact: contacts })
      .from(projectContacts)
      .innerJoin(contacts, eq(contacts.id, projectContacts.contactId))
      .where(eq(projectContacts.lobId, row.lob.id)),
    row.lob.templateId
      ? db
          .select()
          .from(pipelineStages)
          .where(eq(pipelineStages.templateId, row.lob.templateId))
          .orderBy(asc(pipelineStages.order))
      : Promise.resolve([] as (typeof pipelineStages.$inferSelect)[]),
    childIds.length
      ? db
          .select()
          .from(milestones)
          .where(inArray(milestones.projectId, childIds))
          .orderBy(asc(milestones.order), asc(milestones.createdAt))
      : Promise.resolve([] as (typeof milestones.$inferSelect)[]),
  ]);

  return {
    ...row.lob,
    templateName: row.templateName,
    contacts: linkedContacts.map((c) => c.contact),
    stages,
    milestones: rollupMilestones,
  };
}

/* ─── Business ↔ Project links ─────────────────────────────────────────── */

export type BusinessRef = {
  id: string;
  title: string;
  coverEmoji: string | null;
  coverColor: string | null;
  logoUrl: string | null;
};

/** The standing businesses (top-level kind='business' rows) — pickers/checkboxes. */
export async function listBusinesses(workspaceId: string): Promise<BusinessRef[]> {
  return db
    .select({
      id: linesOfBusiness.id,
      title: linesOfBusiness.title,
      coverEmoji: linesOfBusiness.coverEmoji,
      coverColor: linesOfBusiness.coverColor,
      logoUrl: linesOfBusiness.logoUrl,
    })
    .from(linesOfBusiness)
    .where(
      and(
        eq(linesOfBusiness.workspaceId, workspaceId),
        eq(linesOfBusiness.kind, "business"),
        rawSql`${linesOfBusiness.parentLobId} IS NULL`,
      ),
    )
    .orderBy(asc(linesOfBusiness.title));
}

/** Businesses a project rolls up to (header chips on the project page). */
export async function listBusinessLinks(
  projectLobId: string,
  workspaceId: string,
): Promise<BusinessRef[]> {
  const rows = await db
    .select({
      id: linesOfBusiness.id,
      title: linesOfBusiness.title,
      coverEmoji: linesOfBusiness.coverEmoji,
      coverColor: linesOfBusiness.coverColor,
      logoUrl: linesOfBusiness.logoUrl,
    })
    .from(lobBusinessLinks)
    .innerJoin(linesOfBusiness, eq(linesOfBusiness.id, lobBusinessLinks.businessLobId))
    .where(
      and(
        eq(lobBusinessLinks.projectLobId, projectLobId),
        eq(lobBusinessLinks.workspaceId, workspaceId),
      ),
    )
    .orderBy(asc(linesOfBusiness.title));
  return rows;
}

/** Batch variant for the gallery: projectLobId → linked businesses. */
export async function listBusinessLinksForLobs(
  workspaceId: string,
  lobIds: string[],
): Promise<Map<string, BusinessRef[]>> {
  const out = new Map<string, BusinessRef[]>();
  if (lobIds.length === 0) return out;
  const rows = await db
    .select({
      projectLobId: lobBusinessLinks.projectLobId,
      id: linesOfBusiness.id,
      title: linesOfBusiness.title,
      coverEmoji: linesOfBusiness.coverEmoji,
      coverColor: linesOfBusiness.coverColor,
      logoUrl: linesOfBusiness.logoUrl,
    })
    .from(lobBusinessLinks)
    .innerJoin(linesOfBusiness, eq(linesOfBusiness.id, lobBusinessLinks.businessLobId))
    .where(
      and(
        eq(lobBusinessLinks.workspaceId, workspaceId),
        inArray(lobBusinessLinks.projectLobId, lobIds),
      ),
    )
    .orderBy(asc(linesOfBusiness.title));
  for (const { projectLobId, ...ref } of rows) {
    (out.get(projectLobId) ?? out.set(projectLobId, []).get(projectLobId)!).push(ref);
  }
  return out;
}

/**
 * Replace-set a project's business links. Validates kinds: the source must be
 * a kind='project' LoB and every target a top-level kind='business' LoB, all
 * in the caller's workspace — invalid input rejects rather than silently drops.
 */
export async function setBusinessLinks(opts: {
  workspaceId: string;
  projectLobId: string;
  businessIds: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const uniqueIds = Array.from(new Set(opts.businessIds));
  const fence = await db
    .select({ id: linesOfBusiness.id, kind: linesOfBusiness.kind, parentLobId: linesOfBusiness.parentLobId })
    .from(linesOfBusiness)
    .where(
      and(
        eq(linesOfBusiness.workspaceId, opts.workspaceId),
        inArray(linesOfBusiness.id, [opts.projectLobId, ...uniqueIds]),
      ),
    );
  const byId = new Map(fence.map((r) => [r.id, r]));
  const source = byId.get(opts.projectLobId);
  if (!source) return { ok: false, error: "Project not found" };
  if (source.kind !== "project") {
    return { ok: false, error: "Only projects can link to businesses" };
  }
  for (const id of uniqueIds) {
    const target = byId.get(id);
    if (!target || target.kind !== "business" || target.parentLobId) {
      return { ok: false, error: "Linked businesses must be top-level businesses" };
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(lobBusinessLinks)
      .where(
        and(
          eq(lobBusinessLinks.projectLobId, opts.projectLobId),
          eq(lobBusinessLinks.workspaceId, opts.workspaceId),
        ),
      );
    if (uniqueIds.length > 0) {
      await tx.insert(lobBusinessLinks).values(
        uniqueIds.map((businessLobId) => ({
          projectLobId: opts.projectLobId,
          businessLobId,
          workspaceId: opts.workspaceId,
        })),
      );
    }
  });
  return { ok: true };
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

/* ─── LoB links (Business / Marketing / Tech / etc.) ───────────────────── */

export type ProjectLinkRow = typeof schema.projectLinks.$inferSelect;
/**
 * Row enriched with attribution (FR-DOC-17):
 *  - createdByName / updatedByName — uploader + last editor display names.
 *  - editedAt / editedByName — the best "last edited" signal across kinds. For
 *    docs this is the collaborative content's last save (project_doc_contents),
 *    not the row's updatedAt (which only moves on rename/reorder); for files and
 *    links it's the row's updatedAt, falling back to createdAt.
 */
export type ProjectLinkWithAuthor = ProjectLinkRow & {
  createdByName: string | null;
  updatedByName: string | null;
  editedAt: Date | null;
  editedByName: string | null;
};

/**
 * A link row enriched with whether the thing it points to is actually reachable:
 *  - file  → the storage object exists
 *  - link  → it has a URL
 *  - note  → never "attached" (legacy text-only rows)
 * Drives the greyed-out / "Missing" treatment in the board.
 */
export type ProjectLinkView = ProjectLinkWithAuthor & { attached: boolean };

export async function listProjectLinks(opts: {
  lobId: string;
  workspaceId: string;
}): Promise<ProjectLinkWithAuthor[]> {
  const creator = alias(schema.users, "link_creator");
  const updater = alias(schema.users, "link_updater");
  const docUpdater = alias(schema.users, "doc_updater");
  const rows = await db
    .select({
      link: schema.projectLinks,
      createdByName: creator.displayName,
      updatedByName: updater.displayName,
      docUpdatedAt: schema.projectDocContents.updatedAt,
      docUpdatedByName: docUpdater.displayName,
    })
    .from(schema.projectLinks)
    .leftJoin(creator, eq(creator.id, schema.projectLinks.createdBy))
    .leftJoin(updater, eq(updater.id, schema.projectLinks.updatedBy))
    .leftJoin(
      schema.projectDocContents,
      eq(schema.projectDocContents.linkId, schema.projectLinks.id),
    )
    .leftJoin(docUpdater, eq(docUpdater.id, schema.projectDocContents.updatedBy))
    .where(
      and(
        eq(schema.projectLinks.lobId, opts.lobId),
        eq(schema.projectLinks.workspaceId, opts.workspaceId),
      ),
    )
    .orderBy(asc(schema.projectLinks.category), asc(schema.projectLinks.sortOrder));
  return rows.map((r) => {
    const isDoc = r.link.kind === "doc";
    const editedAt = isDoc
      ? r.docUpdatedAt ?? r.link.updatedAt ?? r.link.createdAt
      : r.link.updatedAt ?? r.link.createdAt;
    const editedByName = isDoc
      ? r.docUpdatedByName ?? r.updatedByName ?? r.createdByName
      : r.updatedByName ?? r.createdByName;
    return {
      ...r.link,
      createdByName: r.createdByName,
      updatedByName: r.updatedByName,
      editedAt,
      editedByName,
    };
  });
}

/* ─── LoB link mutations (FR-DOC-1/4/5/6/11) ────────────────────────────── */

export type ProjectLinkCategory = (typeof schema.linkCategory.enumValues)[number];

export type ProjectLinkInput = {
  workspaceId: string;
  lobId: string;
  actorId: string;
  label: string;
  url: string;
  category: ProjectLinkCategory;
  description?: string | null;
};

/**
 * Insert a project_links row with kind='link'. Also writes a 'create' row
 * to project_link_audits in the same transaction. sort_order is computed
 * as MAX+1 within (lob, category) so the new link lands at the bottom.
 */
export async function createProjectLink(input: ProjectLinkInput): Promise<ProjectLinkRow> {
  return db.transaction(async (tx) => {
    const [{ nextOrder }] = await tx
      .select({
        nextOrder: rawSql<number>`COALESCE(MAX(${schema.projectLinks.sortOrder}), -1) + 1`,
      })
      .from(schema.projectLinks)
      .where(
        and(
          eq(schema.projectLinks.lobId, input.lobId),
          eq(schema.projectLinks.category, input.category as ProjectLinkCategory),
        ),
      );

    const [row] = await tx
      .insert(schema.projectLinks)
      .values({
        workspaceId: input.workspaceId,
        lobId: input.lobId,
        kind: "link",
        category: input.category as ProjectLinkCategory,
        label: input.label,
        url: input.url,
        description: input.description ?? null,
        sortOrder: Number(nextOrder),
        createdBy: input.actorId,
      })
      .returning();

    await tx.insert(schema.projectLinkAudits).values({
      workspaceId: input.workspaceId,
      lobId: input.lobId,
      linkId: row.id,
      actorId: input.actorId,
      action: "create",
      before: null,
      after: row,
    });

    return row;
  });
}

export type ProjectLinkUpdate = {
  workspaceId: string;
  lobId: string;
  actorId: string;
  linkId: string;
  label?: string;
  url?: string;
  category?: ProjectLinkCategory;
  description?: string | null;
};

/** Update mutable fields; if category changes, append to bottom of new category. */
export async function updateProjectLink(input: ProjectLinkUpdate): Promise<ProjectLinkRow> {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(schema.projectLinks)
      .where(
        and(
          eq(schema.projectLinks.id, input.linkId),
          eq(schema.projectLinks.workspaceId, input.workspaceId),
        ),
      );
    if (!before) throw new Error("Link not found");

    const patch: Partial<typeof schema.projectLinks.$inferInsert> = {
      updatedAt: new Date(),
      updatedBy: input.actorId,
    };
    if (input.label !== undefined) patch.label = input.label;
    if (input.url !== undefined) patch.url = input.url;
    if (input.description !== undefined) patch.description = input.description;
    if (input.category && input.category !== before.category) {
      const [{ nextOrder }] = await tx
        .select({
          nextOrder: rawSql<number>`COALESCE(MAX(${schema.projectLinks.sortOrder}), -1) + 1`,
        })
        .from(schema.projectLinks)
        .where(
          and(
            eq(schema.projectLinks.lobId, before.lobId),
            eq(schema.projectLinks.category, input.category),
          ),
        );
      patch.category = input.category;
      patch.sortOrder = Number(nextOrder);
    }

    const [row] = await tx
      .update(schema.projectLinks)
      .set(patch)
      .where(eq(schema.projectLinks.id, input.linkId))
      .returning();

    await tx.insert(schema.projectLinkAudits).values({
      workspaceId: input.workspaceId,
      lobId: input.lobId,
      linkId: row.id,
      actorId: input.actorId,
      action: "update",
      before,
      after: row,
    });

    return row;
  });
}

/** Hard-delete the row + write audit with full snapshot in `before`. */
export async function deleteProjectLink(input: {
  workspaceId: string;
  lobId: string;
  actorId: string;
  linkId: string;
}): Promise<ProjectLinkRow> {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(schema.projectLinks)
      .where(
        and(
          eq(schema.projectLinks.id, input.linkId),
          eq(schema.projectLinks.workspaceId, input.workspaceId),
        ),
      );
    if (!before) throw new Error("Link not found");

    await tx.delete(schema.projectLinks).where(eq(schema.projectLinks.id, input.linkId));

    await tx.insert(schema.projectLinkAudits).values({
      workspaceId: input.workspaceId,
      lobId: input.lobId,
      linkId: input.linkId,
      actorId: input.actorId,
      action: "delete",
      before,
      after: null,
    });

    return before;
  });
}

/** Bulk-set sort_order for a list of (linkId, sortOrder) pairs within one category. */
export async function reorderProjectLinks(input: {
  workspaceId: string;
  lobId: string;
  actorId: string;
  category: ProjectLinkCategory;
  orderedLinkIds: string[];
}): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < input.orderedLinkIds.length; i++) {
      await tx
        .update(schema.projectLinks)
        .set({ sortOrder: i, updatedAt: new Date(), updatedBy: input.actorId })
        .where(
          and(
            eq(schema.projectLinks.id, input.orderedLinkIds[i]),
            eq(schema.projectLinks.workspaceId, input.workspaceId),
            eq(schema.projectLinks.lobId, input.lobId),
            eq(schema.projectLinks.category, input.category),
          ),
        );
    }
    // Single audit row for the bulk reorder
    await tx.insert(schema.projectLinkAudits).values({
      workspaceId: input.workspaceId,
      lobId: input.lobId,
      linkId: input.orderedLinkIds[0] ?? input.actorId, // satisfies NOT NULL; reorder is a bulk op
      actorId: input.actorId,
      action: "reorder",
      before: null,
      after: { category: input.category, order: input.orderedLinkIds },
    });
  });
}

/* ─── LoB files (Step 2 — FR-DOC-13/18/19) ──────────────────────────────── */

export async function getProjectLinkById(opts: {
  linkId: string;
  workspaceId: string;
}): Promise<ProjectLinkRow | null> {
  const [row] = await db
    .select()
    .from(schema.projectLinks)
    .where(
      and(
        eq(schema.projectLinks.id, opts.linkId),
        eq(schema.projectLinks.workspaceId, opts.workspaceId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type ProjectFileInput = {
  workspaceId: string;
  lobId: string;
  actorId: string;
  label: string;
  category: ProjectLinkCategory;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
};

/** Insert a kind='file' row + 'create' audit. sort_order = MAX+1 in category. */
export async function createProjectFile(input: ProjectFileInput): Promise<ProjectLinkRow> {
  return db.transaction(async (tx) => {
    const [{ nextOrder }] = await tx
      .select({
        nextOrder: rawSql<number>`COALESCE(MAX(${schema.projectLinks.sortOrder}), -1) + 1`,
      })
      .from(schema.projectLinks)
      .where(
        and(
          eq(schema.projectLinks.lobId, input.lobId),
          eq(schema.projectLinks.category, input.category),
        ),
      );

    const [row] = await tx
      .insert(schema.projectLinks)
      .values({
        workspaceId: input.workspaceId,
        lobId: input.lobId,
        kind: "file",
        category: input.category,
        label: input.label,
        url: null,
        storagePath: input.storagePath,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        originalFilename: input.originalFilename,
        sortOrder: Number(nextOrder),
        createdBy: input.actorId,
      })
      .returning();

    await tx.insert(schema.projectLinkAudits).values({
      workspaceId: input.workspaceId,
      lobId: input.lobId,
      linkId: row.id,
      actorId: input.actorId,
      action: "create",
      before: null,
      after: row,
    });

    return row;
  });
}

/** Write a standalone audit row (e.g. 'file_missing', 'storage_orphan'). */
export async function recordLinkAudit(input: {
  workspaceId: string;
  lobId: string | null;
  linkId: string;
  actorId: string;
  action: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  await db.insert(schema.projectLinkAudits).values({
    workspaceId: input.workspaceId,
    lobId: input.lobId,
    linkId: input.linkId,
    actorId: input.actorId,
    action: input.action,
    before: input.before ?? null,
    after: input.after ?? null,
  });
}
