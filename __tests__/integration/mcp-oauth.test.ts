/**
 * [integration] Full MCP OAuth server flow against a real Postgres:
 *   register client → issue+exchange auth code (PKCE) → resolve token to a
 *   ToolContext → run real CRM tools through it → refresh → revoke.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createHash } from "crypto";
import { db, schema } from "@/db";
import {
  registerClient,
  issueAuthCode,
  exchangeAuthCode,
  refreshTokens,
  resolveTokenToContext,
} from "@/lib/mcp/oauth.server";
import { createToken } from "@/lib/mcp/token.server";
import { executeMcpTool } from "@/lib/mcp/tools";
import { FAKE_USER_ID, FAKE_WORKSPACE_ID } from "./setup";

const REDIRECT_URI = "http://127.0.0.1:53682/callback";

function pkce() {
  const verifier = createToken();
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function connect(now = new Date()) {
  const { clientId } = await registerClient({
    clientName: "Claude Code (test)",
    redirectUris: [REDIRECT_URI],
  });
  const { verifier, challenge } = pkce();
  const code = await issueAuthCode({
    clientId,
    userId: FAKE_USER_ID,
    workspaceId: FAKE_WORKSPACE_ID,
    redirectUri: REDIRECT_URI,
    codeChallenge: challenge,
    now,
  });
  return { clientId, verifier, code };
}

describe("[integration] MCP OAuth flow", () => {
  beforeEach(async () => {
    await db.execute(
      /* sql */ `truncate table mcp_access_tokens, mcp_auth_codes, mcp_oauth_clients cascade`,
    );
  });

  it("registers a client and persists its redirect URIs", async () => {
    const { clientId } = await registerClient({
      clientName: "X",
      redirectUris: [REDIRECT_URI],
    });
    const all = await db.select().from(schema.mcpOauthClients);
    const found = all.find((c) => c.id === clientId)!;
    expect(found).toBeTruthy();
    expect(found.redirectUris).toEqual([REDIRECT_URI]);
    expect(clientId.startsWith("mcp_")).toBe(true);
  });

  it("exchanges a PKCE auth code for tokens and resolves a ToolContext", async () => {
    const now = new Date();
    const { clientId, verifier, code } = await connect(now);

    const res = await exchangeAuthCode({
      code,
      clientId,
      redirectUri: REDIRECT_URI,
      codeVerifier: verifier,
      now,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const ctx = await resolveTokenToContext(res.tokens.accessToken, new Date());
    expect(ctx).not.toBeNull();
    expect(ctx!.userId).toBe(FAKE_USER_ID);
    expect(ctx!.workspaceId).toBe(FAKE_WORKSPACE_ID);
    expect(ctx!.workspaceRole).toBe("owner");
    expect(typeof ctx!.ownerTimezone).toBe("string");
  });

  it("rejects a wrong PKCE verifier", async () => {
    const now = new Date();
    const { clientId, code } = await connect(now);
    const res = await exchangeAuthCode({
      code,
      clientId,
      redirectUri: REDIRECT_URI,
      codeVerifier: createToken(), // wrong
      now,
    });
    expect(res.ok).toBe(false);
  });

  it("rejects a reused (single-use) auth code", async () => {
    const now = new Date();
    const { clientId, verifier, code } = await connect(now);
    const first = await exchangeAuthCode({ code, clientId, redirectUri: REDIRECT_URI, codeVerifier: verifier, now });
    expect(first.ok).toBe(true);
    const second = await exchangeAuthCode({ code, clientId, redirectUri: REDIRECT_URI, codeVerifier: verifier, now });
    expect(second.ok).toBe(false);
  });

  it("runs real CRM tools through the resolved context (write then read)", async () => {
    const now = new Date();
    const { clientId, verifier, code } = await connect(now);
    const res = await exchangeAuthCode({ code, clientId, redirectUri: REDIRECT_URI, codeVerifier: verifier, now });
    if (!res.ok) throw new Error("exchange failed");
    const ctx = (await resolveTokenToContext(res.tokens.accessToken, new Date()))!;
    expect(ctx).not.toBeNull();

    // Upload: create a contact via the MCP tool surface.
    const created = await executeMcpTool(
      "create_contact",
      { name: "Mara MCP", relationship: "lead", organization: "Acme" },
      ctx,
    );
    expect(created.ok).toBe(true);

    // Context: find it back.
    const found = await executeMcpTool("find_contact", { query: "Mara MCP" }, ctx);
    expect(found.ok).toBe(true);
    if (found.ok) {
      const matches = (found.data as { matches: { name: string }[] }).matches;
      expect(matches.some((m) => m.name.includes("Mara MCP"))).toBe(true);
    }

    // A non-allowlisted tool is rejected even with a valid context.
    const blocked = await executeMcpTool("send_message", {}, ctx);
    expect(blocked.ok).toBe(false);
  });

  it("rotates on refresh and revokes access", async () => {
    const now = new Date();
    const { clientId, verifier, code } = await connect(now);
    const res = await exchangeAuthCode({ code, clientId, redirectUri: REDIRECT_URI, codeVerifier: verifier, now });
    if (!res.ok) throw new Error("exchange failed");

    // Refresh rotates: new access token works, old refresh token is dead.
    const refreshed = await refreshTokens({ refreshToken: res.tokens.refreshToken, clientId, now: new Date() });
    expect(refreshed.ok).toBe(true);
    if (!refreshed.ok) return;
    expect(await resolveTokenToContext(refreshed.tokens.accessToken, new Date())).not.toBeNull();
    const reuseOld = await refreshTokens({ refreshToken: res.tokens.refreshToken, clientId, now: new Date() });
    expect(reuseOld.ok).toBe(false);

    // Revoke the live token row → resolution fails.
    await db.execute(/* sql */ `update mcp_access_tokens set revoked_at = now()`);
    expect(await resolveTokenToContext(refreshed.tokens.accessToken, new Date())).toBeNull();
  });
});
