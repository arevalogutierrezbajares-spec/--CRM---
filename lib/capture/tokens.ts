/**
 * Helper bearer tokens (NFR-CALL-SEC-2): revocable, founder-scoped, stored
 * hashed (SHA-256). Plaintext shape: `agbcap_<64 hex>` — shown exactly once
 * at mint time in Settings.
 */
import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";

const { captureTokens, users } = schema;

export const TOKEN_PREFIX = "agbcap_";

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

export function mintTokenPlaintext(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("hex")}`;
}

export type CaptureIdentity = {
  tokenId: string;
  userId: string;
  workspaceId: string;
  displayName: string | null;
};

/**
 * Resolve `Authorization: Bearer agbcap_…` to an identity, or null.
 * Hash-then-lookup keeps this O(1); the timingSafeEqual re-check makes the
 * comparison constant-time even if the unique index lookup short-circuits.
 */
export async function resolveCaptureToken(
  authorizationHeader: string | null,
): Promise<CaptureIdentity | null> {
  const m = /^Bearer\s+(agbcap_[0-9a-f]{64})$/.exec(authorizationHeader ?? "");
  if (!m) return null;
  const presented = hashToken(m[1]);
  const [row] = await db
    .select({
      id: captureTokens.id,
      userId: captureTokens.userId,
      workspaceId: captureTokens.workspaceId,
      tokenHash: captureTokens.tokenHash,
      displayName: users.displayName,
    })
    .from(captureTokens)
    .leftJoin(users, eq(users.id, captureTokens.userId))
    .where(
      and(eq(captureTokens.tokenHash, presented), isNull(captureTokens.revokedAt)),
    )
    .limit(1);
  if (!row) return null;
  const a = Buffer.from(row.tokenHash, "hex");
  const b = Buffer.from(presented, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  // Fire-and-forget freshness stamp; never blocks the request.
  void db
    .update(captureTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(captureTokens.id, row.id))
    .catch(() => {});
  return {
    tokenId: row.id,
    userId: row.userId,
    workspaceId: row.workspaceId,
    displayName: row.displayName ?? null,
  };
}
