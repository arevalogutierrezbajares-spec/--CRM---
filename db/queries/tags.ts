import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const { tags, contactTags } = schema;

export type TagRow = typeof tags.$inferSelect;

export async function listTags(): Promise<TagRow[]> {
  return db.select().from(tags).orderBy(asc(tags.name));
}

/** Usage counts (number of contacts) per tag id — for the tag manager. */
export async function getTagUsageCounts(): Promise<Map<string, number>> {
  const rows = await db
    .select({
      tagId: contactTags.tagId,
      count: sql<number>`count(*)::int`,
    })
    .from(contactTags)
    .groupBy(contactTags.tagId);
  return new Map(rows.map((r) => [r.tagId, r.count]));
}

export async function createTag(input: {
  name: string;
  kind?: "venture" | "custom";
  color?: string | null;
  category?: string | null;
}): Promise<TagRow> {
  const [row] = await db
    .insert(tags)
    .values({
      name: input.name.trim(),
      kind: input.kind ?? "custom",
      color: input.color ?? null,
      category: input.category?.trim() || null,
    })
    .returning();
  return row;
}

export async function updateTag(input: {
  id: string;
  name?: string;
  color?: string | null;
  category?: string | null;
}): Promise<TagRow | null> {
  const patch: Partial<TagRow> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.color !== undefined) patch.color = input.color;
  if (input.category !== undefined) patch.category = input.category?.trim() || null;
  if (Object.keys(patch).length === 0) {
    const [row] = await db.select().from(tags).where(eq(tags.id, input.id)).limit(1);
    return row ?? null;
  }
  const [row] = await db
    .update(tags)
    .set(patch)
    .where(eq(tags.id, input.id))
    .returning();
  return row ?? null;
}

export async function deleteTag(id: string): Promise<void> {
  // contact_tags rows cascade away via the FK.
  await db.delete(tags).where(eq(tags.id, id));
}

/**
 * Merge `fromId` into `toId`: re-point every contact tagged with the source
 * onto the target (skipping ones already on the target to avoid PK conflicts),
 * then delete the source tag.
 */
export async function mergeTags(input: {
  fromId: string;
  toId: string;
}): Promise<void> {
  if (input.fromId === input.toId) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      update contact_tags ct
      set tag_id = ${input.toId}
      where ct.tag_id = ${input.fromId}
        and not exists (
          select 1 from contact_tags existing
          where existing.contact_id = ct.contact_id
            and existing.tag_id = ${input.toId}
        )
    `);
    // Any leftover source links (contact already had the target) just drop.
    await tx.delete(contactTags).where(eq(contactTags.tagId, input.fromId));
    await tx.delete(tags).where(eq(tags.id, input.fromId));
  });
}
