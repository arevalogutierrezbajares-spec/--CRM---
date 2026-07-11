import { randomBytes } from "crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { demoLinks } from "@/db/schema";

export type DemoLinkRow = typeof demoLinks.$inferSelect;
export type DemoLinkInsert = typeof demoLinks.$inferInsert;

/** Unguessable share token (24 random bytes → 32-char base64url). */
function createDemoShareToken(): string {
  return randomBytes(24).toString("base64url");
}

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

/**
 * Turn a demo link into a publicly shareable page. Mints a fresh token
 * (replacing any prior one — so this doubles as "regenerate") and returns it.
 * The URL is `${SITE_URL}/demo/${token}`.
 */
export async function shareDemoLink(args: {
  id: string;
  workspaceId: string;
}): Promise<{ token: string } | null> {
  const token = createDemoShareToken();
  const [row] = await db
    .update(demoLinks)
    .set({
      publicAccessToken: token,
      publicAccessTokenCreatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(eq(demoLinks.id, args.id), eq(demoLinks.workspaceId, args.workspaceId)),
    )
    .returning({ token: demoLinks.publicAccessToken });
  return row?.token ? { token: row.token } : null;
}

/** Revoke public access — the /demo/<token> link stops resolving. */
export async function unshareDemoLink(args: {
  id: string;
  workspaceId: string;
}): Promise<boolean> {
  const rows = await db
    .update(demoLinks)
    .set({ publicAccessToken: null, updatedAt: new Date() })
    .where(
      and(eq(demoLinks.id, args.id), eq(demoLinks.workspaceId, args.workspaceId)),
    )
    .returning({ id: demoLinks.id });
  return rows.length > 0;
}

/** Public lookup for the /demo/<token> page. No workspace scope — the token is
 *  the credential. Returns null for unknown/revoked tokens. */
export async function getPublicDemoLinkByToken(
  token: string,
): Promise<DemoLinkRow | null> {
  if (!token) return null;
  const [row] = await db
    .select()
    .from(demoLinks)
    .where(eq(demoLinks.publicAccessToken, token))
    .limit(1);
  return row ?? null;
}

/** Fire-and-forget view tally for the public demo page. */
export async function recordDemoLinkView(id: string): Promise<void> {
  await db
    .update(demoLinks)
    .set({
      publicAccessLastViewedAt: new Date(),
      publicViewCount: sql`${demoLinks.publicViewCount} + 1`,
    })
    .where(eq(demoLinks.id, id));
}

/** Demo links in a workspace that are currently shared — for the room "attach
 *  a demo" picker. */
export async function listShareableDemoLinks(
  workspaceId: string,
): Promise<DemoLinkRow[]> {
  return db
    .select()
    .from(demoLinks)
    .where(eq(demoLinks.workspaceId, workspaceId))
    .orderBy(asc(demoLinks.platformId), asc(demoLinks.sortOrder));
}

/** Workspace-scoped fetch by id — used to render a room's featured demo. */
export async function getDemoLinkById(args: {
  id: string;
  workspaceId: string;
}): Promise<DemoLinkRow | null> {
  const [row] = await db
    .select()
    .from(demoLinks)
    .where(
      and(eq(demoLinks.id, args.id), eq(demoLinks.workspaceId, args.workspaceId)),
    )
    .limit(1);
  return row ?? null;
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
