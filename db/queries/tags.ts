import { asc } from "drizzle-orm";
import { db, schema } from "@/db";

const { tags } = schema;

export type TagRow = typeof tags.$inferSelect;

export async function listTags(): Promise<TagRow[]> {
  return db.select().from(tags).orderBy(asc(tags.name));
}
