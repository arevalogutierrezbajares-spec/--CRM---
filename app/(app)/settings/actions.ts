"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";

const { mcpAccessTokens, mcpOauthClients } = schema;

/** Live Claude Code / Claude Desktop (MCP) connections for the signed-in user. */
export async function listMcpConnections() {
  const user = await requireUser();
  return db
    .select({
      id: mcpAccessTokens.id,
      clientName: mcpOauthClients.clientName,
      lastUsedAt: mcpAccessTokens.lastUsedAt,
      createdAt: mcpAccessTokens.createdAt,
    })
    .from(mcpAccessTokens)
    .leftJoin(mcpOauthClients, eq(mcpAccessTokens.clientId, mcpOauthClients.id))
    .where(
      and(eq(mcpAccessTokens.userId, user.id), isNull(mcpAccessTokens.revokedAt)),
    )
    .orderBy(desc(mcpAccessTokens.createdAt));
}

/** Revoke a single MCP connection (the next tool call from it gets a 401). */
export async function revokeMcpConnection(id: string) {
  const user = await requireUser();
  await db
    .update(mcpAccessTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(mcpAccessTokens.id, id), eq(mcpAccessTokens.userId, user.id)));
  revalidatePath("/settings");
  return { ok: true as const };
}
