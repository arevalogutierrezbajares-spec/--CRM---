import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { demoLinks } from "@/db/schema";

export type DemoLinkRow = typeof demoLinks.$inferSelect;
export type DemoLinkInsert = typeof demoLinks.$inferInsert;

export async function listDemoLinks(workspaceId: string): Promise<DemoLinkRow[]> {
  return db
    .select()
    .from(demoLinks)
    .where(eq(demoLinks.workspaceId, workspaceId))
    .orderBy(
      asc(demoLinks.platformId),
      asc(demoLinks.sortOrder),
      asc(demoLinks.createdAt),
    );
}

export async function createDemoLink(values: DemoLinkInsert): Promise<DemoLinkRow> {
  const [row] = await db.insert(demoLinks).values(values).returning();
  return row;
}

/** Bulk insert used by the one-click seed action. */
export async function createDemoLinks(values: DemoLinkInsert[]): Promise<number> {
  if (values.length === 0) return 0;
  const rows = await db.insert(demoLinks).values(values).returning();
  return rows.length;
}

export async function updateDemoLink(args: {
  id: string;
  workspaceId: string;
  patch: Partial<
    Pick<
      DemoLinkInsert,
      | "platformId"
      | "label"
      | "description"
      | "url"
      | "username"
      | "password"
      | "accessNotes"
      | "sortOrder"
    >
  >;
}): Promise<DemoLinkRow | null> {
  const [row] = await db
    .update(demoLinks)
    .set({ ...args.patch, updatedAt: new Date() })
    .where(
      and(eq(demoLinks.id, args.id), eq(demoLinks.workspaceId, args.workspaceId)),
    )
    .returning();
  return row ?? null;
}

export async function deleteDemoLink(args: {
  id: string;
  workspaceId: string;
}): Promise<boolean> {
  const rows = await db
    .delete(demoLinks)
    .where(
      and(eq(demoLinks.id, args.id), eq(demoLinks.workspaceId, args.workspaceId)),
    )
    .returning({ id: demoLinks.id });
  return rows.length > 0;
}

export async function countDemoLinksForPlatform(args: {
  workspaceId: string;
  platformId: string;
}): Promise<number> {
  const rows = await db
    .select({ id: demoLinks.id })
    .from(demoLinks)
    .where(
      and(
        eq(demoLinks.workspaceId, args.workspaceId),
        eq(demoLinks.platformId, args.platformId),
      ),
    );
  return rows.length;
}
