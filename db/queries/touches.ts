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

export async function listTouchesForLob(opts: {
  lobId: string;
  workspaceId: string;
}): Promise<TouchRow[]> {
  return db
    .select()
    .from(touches)
    .where(
      and(
        eq(touches.lobId, opts.lobId),
        eq(touches.workspaceId, opts.workspaceId),
      ),
    )
    .orderBy(desc(touches.createdAt))
    .limit(50);
}
