import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { extractProductTags, stripProductTags, type ProductId } from "@/lib/products";

const { enhancements, initiatives, milestones, projects } = schema;

export type EnhancementRow = typeof enhancements.$inferSelect & {
  linkedInitiativeTitle: string | null;
  linkedMilestoneTitle: string | null;
};

/** All enhancements for a product, with linked roadmap titles resolved. */
export async function listEnhancements(
  workspaceId: string,
  product: ProductId,
): Promise<EnhancementRow[]> {
  const rows = await db
    .select()
    .from(enhancements)
    .where(and(eq(enhancements.workspaceId, workspaceId), eq(enhancements.product, product)))
    .orderBy(asc(enhancements.sortOrder), desc(enhancements.createdAt));
  if (rows.length === 0) return [];

  const initIds = [...new Set(rows.map((r) => r.linkedInitiativeId).filter((x): x is string => !!x))];
  const msIds = [...new Set(rows.map((r) => r.linkedMilestoneId).filter((x): x is string => !!x))];
  const initTitles = initIds.length
    ? new Map(
        (await db.select({ id: initiatives.id, title: initiatives.title }).from(initiatives).where(inArray(initiatives.id, initIds))).map(
          (i) => [i.id, i.title],
        ),
      )
    : new Map<string, string>();
  const msTitles = msIds.length
    ? new Map(
        (await db.select({ id: milestones.id, title: milestones.title }).from(milestones).where(inArray(milestones.id, msIds))).map(
          (m) => [m.id, m.title],
        ),
      )
    : new Map<string, string>();

  return rows.map((e) => ({
    ...e,
    linkedInitiativeTitle: e.linkedInitiativeId ? (initTitles.get(e.linkedInitiativeId) ?? null) : null,
    linkedMilestoneTitle: e.linkedMilestoneId ? (msTitles.get(e.linkedMilestoneId) ?? null) : null,
  }));
}

/** Roadmap deliverables tagged to this product (or "all"), for the linkage panel. */
export type ProductRoadmapItem = {
  id: string;
  title: string;
  dueDate: string | null;
  status: string;
  project: string | null;
  initiativeTitle: string | null;
};
export async function listProductRoadmapItems(
  workspaceId: string,
  product: ProductId,
): Promise<ProductRoadmapItem[]> {
  const rows = await db
    .select({
      id: milestones.id,
      title: milestones.title,
      dueDate: milestones.dueDate,
      status: milestones.status,
      project: milestones.project,
      initiativeTitle: initiatives.title,
    })
    .from(milestones)
    .innerJoin(projects, eq(projects.id, milestones.projectId))
    .leftJoin(initiatives, eq(initiatives.id, milestones.initiativeId))
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        ne(milestones.status, "cancelled"),
        inArray(milestones.project, [product, "all"]),
      ),
    )
    .orderBy(asc(milestones.dueDate), desc(milestones.createdAt))
    .limit(100);
  return rows;
}

/**
 * #func capture core (no auth — callers pass resolved workspace/user). Parses
 * #CCfunc/#VAVfunc/#CCAfunc/#CRMfunc out of `text` and creates one Idea-stage
 * enhancement per referenced product, idempotent on (source, sourceRefId,
 * product) so re-saving the same origin never duplicates.
 */
export async function captureProductEnhancementsFor(opts: {
  workspaceId: string;
  userId: string;
  text: string;
  source: "townhall" | "doc" | "mcp" | "action_item" | "manual";
  sourceRefId?: string | null;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
}): Promise<{ created: ProductId[] }> {
  const products = extractProductTags(opts.text);
  if (products.length === 0) return { created: [] };

  const title = stripProductTags(opts.text).slice(0, 280) || "(untitled enhancement)";
  const label = (opts.sourceLabel ?? stripProductTags(opts.text)).slice(0, 140);

  // Dedup against prior captures from the same origin.
  let already = new Set<string>();
  if (opts.sourceRefId) {
    const existing = await db
      .select({ product: enhancements.product })
      .from(enhancements)
      .where(
        and(
          eq(enhancements.workspaceId, opts.workspaceId),
          eq(enhancements.source, opts.source),
          eq(enhancements.sourceRefId, opts.sourceRefId),
        ),
      );
    already = new Set(existing.map((r) => r.product));
  }

  const toCreate = products.filter((p) => !already.has(p));
  if (toCreate.length === 0) return { created: [] };

  await db.insert(enhancements).values(
    toCreate.map((product) => ({
      workspaceId: opts.workspaceId,
      product,
      title,
      status: "idea",
      priority: "next",
      source: opts.source,
      sourceRefId: opts.sourceRefId ?? null,
      sourceLabel: label,
      sourceUrl: opts.sourceUrl ?? null,
      createdBy: opts.userId,
    })),
  );
  return { created: toCreate };
}
