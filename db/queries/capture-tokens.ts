import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";

const { captureTokens } = schema;

export type CaptureTokenListItem = {
  id: string;
  name: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export async function insertCaptureToken(input: {
  workspaceId: string;
  userId: string;
  name: string;
  tokenHash: string;
}): Promise<string> {
  const [row] = await db
    .insert(captureTokens)
    .values(input)
    .returning({ id: captureTokens.id });
  return row.id;
}

export async function listCaptureTokens(opts: {
  workspaceId: string;
}): Promise<CaptureTokenListItem[]> {
  return db
    .select({
      id: captureTokens.id,
      name: captureTokens.name,
      lastUsedAt: captureTokens.lastUsedAt,
      revokedAt: captureTokens.revokedAt,
      createdAt: captureTokens.createdAt,
    })
    .from(captureTokens)
    .where(eq(captureTokens.workspaceId, opts.workspaceId))
    .orderBy(desc(captureTokens.createdAt));
}

export async function revokeCaptureToken(opts: {
  id: string;
  workspaceId: string;
}): Promise<boolean> {
  const rows = await db
    .update(captureTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(captureTokens.id, opts.id),
        eq(captureTokens.workspaceId, opts.workspaceId),
        isNull(captureTokens.revokedAt),
      ),
    )
    .returning({ id: captureTokens.id });
  return rows.length === 1;
}
