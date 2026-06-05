import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

export type InitiativePick = { id: string; title: string };
type ItemKind = "milestone" | "action_item";

/** All initiatives in the workspace, for the multi-select + Town Hall filter chips. */
export async function listInitiativesForPicker(workspaceId: string): Promise<InitiativePick[]> {
  return db
    .select({ id: schema.initiatives.id, title: schema.initiatives.title })
    .from(schema.initiatives)
    .where(eq(schema.initiatives.workspaceId, workspaceId))
    .orderBy(asc(schema.initiatives.title));
}

/** Initiative ids currently linked to one item (workspace-fenced via the item's own row). */
export async function getItemInitiativeIds(
  workspaceId: string,
  entityType: ItemKind,
  itemId: string,
): Promise<string[]> {
  if (entityType === "milestone") {
    const rows = await db
      .select({ initiativeId: schema.milestoneInitiatives.initiativeId })
      .from(schema.milestoneInitiatives)
      .innerJoin(schema.milestones, eq(schema.milestones.id, schema.milestoneInitiatives.milestoneId))
      .where(
        and(
          eq(schema.milestoneInitiatives.milestoneId, itemId),
          eq(schema.milestones.workspaceId, workspaceId),
        ),
      );
    return rows.map((r) => r.initiativeId);
  }
  const rows = await db
    .select({ initiativeId: schema.actionItemInitiatives.initiativeId })
    .from(schema.actionItemInitiatives)
    .innerJoin(schema.actionItems, eq(schema.actionItems.id, schema.actionItemInitiatives.actionItemId))
    .where(
      and(
        eq(schema.actionItemInitiatives.actionItemId, itemId),
        eq(schema.actionItems.workspaceId, workspaceId),
      ),
    );
  return rows.map((r) => r.initiativeId);
}

/** True if the item belongs to this workspace. */
async function itemInWorkspace(workspaceId: string, entityType: ItemKind, itemId: string): Promise<boolean> {
  const tbl = entityType === "milestone" ? schema.milestones : schema.actionItems;
  const [row] = await db
    .select({ id: tbl.id })
    .from(tbl)
    .where(and(eq(tbl.id, itemId), eq(tbl.workspaceId, workspaceId)))
    .limit(1);
  return Boolean(row);
}

/**
 * Replace-set the initiatives linked to a task/action. Validates the item + every
 * initiative id against the workspace (so a foreign initiative can't be attached).
 * For milestones, also syncs `milestones.initiativeId` to the first selected id so the
 * existing single-link Work views keep showing a "primary" initiative.
 */
export async function setItemInitiatives(
  workspaceId: string,
  entityType: ItemKind,
  itemId: string,
  initiativeIds: string[],
): Promise<boolean> {
  if (!(await itemInWorkspace(workspaceId, entityType, itemId))) return false;

  // Keep only initiative ids that actually belong to this workspace.
  const valid =
    initiativeIds.length === 0
      ? []
      : (
          await db
            .select({ id: schema.initiatives.id })
            .from(schema.initiatives)
            .where(
              and(
                eq(schema.initiatives.workspaceId, workspaceId),
                inArray(schema.initiatives.id, initiativeIds),
              ),
            )
        ).map((r) => r.id);

  await db.transaction(async (tx) => {
    if (entityType === "milestone") {
      await tx.delete(schema.milestoneInitiatives).where(eq(schema.milestoneInitiatives.milestoneId, itemId));
      if (valid.length > 0) {
        await tx
          .insert(schema.milestoneInitiatives)
          .values(valid.map((initiativeId) => ({ milestoneId: itemId, initiativeId })));
      }
      // Sync the convenience "primary" single-link column.
      await tx
        .update(schema.milestones)
        .set({ initiativeId: valid[0] ?? null })
        .where(eq(schema.milestones.id, itemId));
    } else {
      await tx.delete(schema.actionItemInitiatives).where(eq(schema.actionItemInitiatives.actionItemId, itemId));
      if (valid.length > 0) {
        await tx
          .insert(schema.actionItemInitiatives)
          .values(valid.map((initiativeId) => ({ actionItemId: itemId, initiativeId })));
      }
    }
  });
  return true;
}

/**
 * Batch: initiatives linked to many milestones + action items at once (for the
 * activity-feed badges). Returns two maps keyed by item id.
 */
export async function initiativesByItems(
  workspaceId: string,
  milestoneIds: string[],
  actionItemIds: string[],
): Promise<{ byMilestone: Map<string, InitiativePick[]>; byActionItem: Map<string, InitiativePick[]> }> {
  const byMilestone = new Map<string, InitiativePick[]>();
  const byActionItem = new Map<string, InitiativePick[]>();

  const [msRows, aiRows] = await Promise.all([
    milestoneIds.length === 0
      ? Promise.resolve([] as { itemId: string; id: string; title: string }[])
      : db
          .select({
            itemId: schema.milestoneInitiatives.milestoneId,
            id: schema.initiatives.id,
            title: schema.initiatives.title,
          })
          .from(schema.milestoneInitiatives)
          .innerJoin(schema.initiatives, eq(schema.initiatives.id, schema.milestoneInitiatives.initiativeId))
          .where(
            and(
              eq(schema.initiatives.workspaceId, workspaceId),
              inArray(schema.milestoneInitiatives.milestoneId, milestoneIds),
            ),
          ),
    actionItemIds.length === 0
      ? Promise.resolve([] as { itemId: string; id: string; title: string }[])
      : db
          .select({
            itemId: schema.actionItemInitiatives.actionItemId,
            id: schema.initiatives.id,
            title: schema.initiatives.title,
          })
          .from(schema.actionItemInitiatives)
          .innerJoin(schema.initiatives, eq(schema.initiatives.id, schema.actionItemInitiatives.initiativeId))
          .where(
            and(
              eq(schema.initiatives.workspaceId, workspaceId),
              inArray(schema.actionItemInitiatives.actionItemId, actionItemIds),
            ),
          ),
  ]);

  for (const r of msRows) {
    const arr = byMilestone.get(r.itemId) ?? byMilestone.set(r.itemId, []).get(r.itemId)!;
    arr.push({ id: r.id, title: r.title });
  }
  for (const r of aiRows) {
    const arr = byActionItem.get(r.itemId) ?? byActionItem.set(r.itemId, []).get(r.itemId)!;
    arr.push({ id: r.id, title: r.title });
  }
  return { byMilestone, byActionItem };
}
