import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

const { touches } = schema;

export type TouchRow = typeof touches.$inferSelect;

export async function listTouchesForContact(opts: {
  contactId: string;
  ownerId: string;
}): Promise<TouchRow[]> {
  return db
    .select()
    .from(touches)
    .where(
      and(eq(touches.contactId, opts.contactId), eq(touches.createdBy, opts.ownerId)),
    )
    .orderBy(desc(touches.createdAt))
    .limit(50);
}

export async function listTouchesForProject(opts: {
  projectId: string;
  ownerId: string;
}): Promise<TouchRow[]> {
  return db
    .select()
    .from(touches)
    .where(
      and(eq(touches.projectId, opts.projectId), eq(touches.createdBy, opts.ownerId)),
    )
    .orderBy(desc(touches.createdAt))
    .limit(50);
}
