import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createToken, hashToken, verifyPkceS256 } from "./token.server";
import type { ToolContext } from "@/lib/wa-agent/tools";

const { mcpOauthClients, mcpAuthCodes, mcpAccessTokens, users, workspaceMembers } =
  schema;

export const MCP_SCOPE = "crm.read crm.write";
const AUTH_CODE_TTL_MS = 10 * 60 * 1000; //               10 minutes
const ACCESS_TTL_MS = 60 * 60 * 1000; //                  1 hour
const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000; //       90 days
const DEFAULT_TZ = "America/New_York";

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  scope: string;
};

// ── Dynamic Client Registration (RFC 7591) ──────────────────────────────────

export async function registerClient(input: {
  clientName?: string | null;
  redirectUris: string[];
}): Promise<{ clientId: string }> {
  const clientId = `mcp_${createToken()}`;
  await db.insert(mcpOauthClients).values({
    id: clientId,
    clientName: input.clientName ?? null,
    redirectUris: input.redirectUris,
  });
  return { clientId };
}

export async function getClient(clientId: string) {
  const [c] = await db
    .select()
    .from(mcpOauthClients)
    .where(eq(mcpOauthClients.id, clientId))
    .limit(1);
  return c ?? null;
}

// ── Authorization codes ─────────────────────────────────────────────────────

export async function issueAuthCode(input: {
  clientId: string;
  userId: string;
  workspaceId: string;
  redirectUri: string;
  codeChallenge: string;
  scope?: string;
  resource?: string | null;
  now: Date;
}): Promise<string> {
  const code = createToken();
  await db.insert(mcpAuthCodes).values({
    codeHash: hashToken(code),
    clientId: input.clientId,
    userId: input.userId,
    workspaceId: input.workspaceId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    scope: input.scope ?? MCP_SCOPE,
    resource: input.resource ?? null,
    expiresAt: new Date(input.now.getTime() + AUTH_CODE_TTL_MS),
  });
  return code;
}

export async function exchangeAuthCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  now: Date;
}): Promise<{ ok: true; tokens: IssuedTokens } | { ok: false; error: string }> {
  const codeHash = hashToken(input.code);
  const [row] = await db
    .select()
    .from(mcpAuthCodes)
    .where(eq(mcpAuthCodes.codeHash, codeHash))
    .limit(1);

  if (
    !row ||
    row.consumedAt ||
    row.expiresAt.getTime() < input.now.getTime() ||
    row.clientId !== input.clientId ||
    row.redirectUri !== input.redirectUri ||
    !verifyPkceS256(input.codeVerifier, row.codeChallenge)
  ) {
    return { ok: false, error: "invalid_grant" };
  }

  // Single-use: burn the code before issuing tokens.
  await db
    .update(mcpAuthCodes)
    .set({ consumedAt: input.now })
    .where(eq(mcpAuthCodes.codeHash, codeHash));

  const tokens = await mintTokens({
    clientId: row.clientId,
    userId: row.userId,
    workspaceId: row.workspaceId,
    scope: row.scope,
    now: input.now,
  });
  return { ok: true, tokens };
}

// ── Access / refresh tokens ──────────────────────────────────────────────────

async function mintTokens(input: {
  clientId: string;
  userId: string;
  workspaceId: string;
  scope: string;
  now: Date;
}): Promise<IssuedTokens> {
  const accessToken = createToken();
  const refreshToken = createToken();
  await db.insert(mcpAccessTokens).values({
    accessTokenHash: hashToken(accessToken),
    refreshTokenHash: hashToken(refreshToken),
    clientId: input.clientId,
    userId: input.userId,
    workspaceId: input.workspaceId,
    scope: input.scope,
    accessExpiresAt: new Date(input.now.getTime() + ACCESS_TTL_MS),
    refreshExpiresAt: new Date(input.now.getTime() + REFRESH_TTL_MS),
  });
  return {
    accessToken,
    refreshToken,
    expiresInSeconds: Math.floor(ACCESS_TTL_MS / 1000),
    scope: input.scope,
  };
}

export async function refreshTokens(input: {
  refreshToken: string;
  clientId: string;
  now: Date;
}): Promise<{ ok: true; tokens: IssuedTokens } | { ok: false; error: string }> {
  const refreshHash = hashToken(input.refreshToken);
  const [row] = await db
    .select()
    .from(mcpAccessTokens)
    .where(eq(mcpAccessTokens.refreshTokenHash, refreshHash))
    .limit(1);

  if (
    !row ||
    row.revokedAt ||
    row.clientId !== input.clientId ||
    !row.refreshExpiresAt ||
    row.refreshExpiresAt.getTime() < input.now.getTime()
  ) {
    return { ok: false, error: "invalid_grant" };
  }

  // Rotate: revoke the old row, issue a fresh access+refresh pair.
  await db
    .update(mcpAccessTokens)
    .set({ revokedAt: input.now })
    .where(eq(mcpAccessTokens.id, row.id));

  const tokens = await mintTokens({
    clientId: row.clientId,
    userId: row.userId,
    workspaceId: row.workspaceId,
    scope: row.scope,
    now: input.now,
  });
  return { ok: true, tokens };
}

// ── Bearer token → ToolContext ───────────────────────────────────────────────

/**
 * Resolve an MCP access token to the tool-execution context, or null if the
 * token is unknown, revoked, or expired. Also stamps last_used_at for the
 * connections list in settings.
 */
export async function resolveTokenToContext(
  bearer: string,
  now: Date,
): Promise<ToolContext | null> {
  const accessHash = hashToken(bearer);
  const [row] = await db
    .select()
    .from(mcpAccessTokens)
    .where(eq(mcpAccessTokens.accessTokenHash, accessHash))
    .limit(1);

  if (!row || row.revokedAt || row.accessExpiresAt.getTime() < now.getTime()) {
    return null;
  }

  const [member] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, row.workspaceId),
        eq(workspaceMembers.userId, row.userId),
      ),
    )
    .limit(1);
  if (!member) return null; // user was removed from the workspace

  const [u] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);

  await db
    .update(mcpAccessTokens)
    .set({ lastUsedAt: now })
    .where(eq(mcpAccessTokens.id, row.id));

  return {
    workspaceId: row.workspaceId,
    userId: row.userId,
    workspaceRole: member.role,
    ownerTimezone: u?.timezone ?? DEFAULT_TZ,
    now,
  };
}
