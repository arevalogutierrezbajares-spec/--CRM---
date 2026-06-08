import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

const { touches } = schema;

export type TouchRow = typeof touches.$inferSelect;

export async function listTouchesForContact(opts: {
  contactId: string;
  workspaceId: string;
}): Promise<TouchRow[]> {
  return db
    .select()
    .from(touches)
    .where(
      and(
        eq(touches.contactId, opts.contactId),
        eq(touches.workspaceId, opts.workspaceId),
      ),
    )
    .orderBy(desc(touches.createdAt))
    .limit(50);
}

export async function listTouchesForProject(opts: {
  projectId: string;
  workspaceId: string;
}): Promise<TouchRow[]> {
  return db
    .select()
    .from(touches)
    .where(
      and(
        eq(touches.projectId, opts.projectId),
        eq(touches.workspaceId, opts.workspaceId),
      ),
    )
    .orderBy(desc(touches.createdAt))
    .limit(50);
}
