import { and, asc, desc, eq, inArray, sql as rawSql } from "drizzle-orm";
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
  milestoneTotalCount: number;
  milestoneDoneCount: number;
  milestoneProgressPct: number;
  templateName: string | null;
  computedHealth: HealthColor;
  /** Folder-tree preview: { category: ["link label", ...] } */
  linkPreview: Record<string, string[]>;
};

export async function listProjects(opts: {
  workspaceId: string;
  status?: "active" | "waiting" | "done" | "lost";
  /** Default true: hide child projects (sub-modules) from the gallery */
  topLevelOnly?: boolean;
  /** Restrict to children of this parent (used when listing modules) */
  parentId?: string;
}): Promise<ProjectListItem[]> {
  const conditions = [eq(projects.workspaceId, opts.workspaceId)];
  if (opts.status) conditions.push(eq(projects.status, opts.status));
  if (opts.parentId) {
    conditions.push(eq(projects.parentProjectId, opts.parentId));
  } else if (opts.topLevelOnly !== false) {
    conditions.push(rawSql`${projects.parentProjectId} IS NULL`);
  }

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

  // Per-project link counts grouped by category (for card hover preview)
  const linkRows = await db
    .select({
      projectId: schema.projectLinks.projectId,
      category: schema.projectLinks.category,
      label: schema.projectLinks.label,
    })
    .from(schema.projectLinks)
    .where(inArray(schema.projectLinks.projectId, ids));

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
    const total = projectMs.length;
    const doneCount = projectMs.filter((m) => m.status === "done").length;

    // Build folder structure: { category: string[] (labels) }
    const linkPreview: Record<string, string[]> = {};
    for (const l of linkRows) {
      if (l.projectId !== project.id) continue;
      (linkPreview[l.category] ??= []).push(l.label);
    }

    return {
      ...project,
      templateName,
      contactCount: contactCounts.filter((c) => c.projectId === project.id)
        .length,
      milestoneOpenCount: projectMs.filter((m) => m.status !== "done").length,
      milestoneOverdueCount: projectMs.filter(
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
/** Row enriched with the uploader's display name (FR-DOC-17 attribution). */
export type ProjectLinkWithAuthor = ProjectLinkRow & {
  createdByName: string | null;
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
  projectId: string;
  workspaceId: string;
}): Promise<ProjectLinkWithAuthor[]> {
  const rows = await db
    .select({
      link: schema.projectLinks,
      createdByName: schema.users.displayName,
    })
    .from(schema.projectLinks)
    .leftJoin(schema.users, eq(schema.users.id, schema.projectLinks.createdBy))
    .where(
      and(
        eq(schema.projectLinks.projectId, opts.projectId),
        eq(schema.projectLinks.workspaceId, opts.workspaceId),
      ),
    )
    .orderBy(asc(schema.projectLinks.category), asc(schema.projectLinks.sortOrder));
  return rows.map((r) => ({ ...r.link, createdByName: r.createdByName }));
}

/* ─── Project link mutations (FR-DOC-1/4/5/6/11) ────────────────────────── */

export type ProjectLinkCategory = (typeof schema.linkCategory.enumValues)[number];

export type ProjectLinkInput = {
  workspaceId: string;
  projectId: string;
  actorId: string;
  label: string;
  url: string;
  category: ProjectLinkCategory;
  description?: string | null;
};

/**
 * Insert a project_links row with kind='link'. Also writes a 'create' row
 * to project_link_audits in the same transaction. sort_order is computed
 * as MAX+1 within (project, category) so the new link lands at the bottom.
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
          eq(schema.projectLinks.projectId, input.projectId),
          eq(schema.projectLinks.category, input.category as ProjectLinkCategory),
        ),
      );

    const [row] = await tx
      .insert(schema.projectLinks)
      .values({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
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
      projectId: input.projectId,
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
  projectId: string;
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
            eq(schema.projectLinks.projectId, before.projectId),
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
      projectId: input.projectId,
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
  projectId: string;
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
      projectId: input.projectId,
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
  projectId: string;
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
            eq(schema.projectLinks.projectId, input.projectId),
            eq(schema.projectLinks.category, input.category),
          ),
        );
    }
    // Single audit row for the bulk reorder
    await tx.insert(schema.projectLinkAudits).values({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      linkId: input.orderedLinkIds[0] ?? input.actorId, // satisfies NOT NULL; reorder is a bulk op
      actorId: input.actorId,
      action: "reorder",
      before: null,
      after: { category: input.category, order: input.orderedLinkIds },
    });
  });
}

/* ─── Project files (Step 2 — FR-DOC-13/18/19) ──────────────────────────── */

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
  projectId: string;
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
          eq(schema.projectLinks.projectId, input.projectId),
          eq(schema.projectLinks.category, input.category),
        ),
      );

    const [row] = await tx
      .insert(schema.projectLinks)
      .values({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
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
      projectId: input.projectId,
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
  projectId: string | null;
  linkId: string;
  actorId: string;
  action: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  await db.insert(schema.projectLinkAudits).values({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    linkId: input.linkId,
    actorId: input.actorId,
    action: input.action,
    before: input.before ?? null,
    after: input.after ?? null,
  });
}
