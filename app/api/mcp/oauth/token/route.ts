import { NextResponse, type NextRequest } from "next/server";
import { exchangeAuthCode, refreshTokens, type IssuedTokens } from "@/lib/mcp/oauth.server";

const NO_STORE = { "Cache-Control": "no-store" };

function tokenError(error: string, status = 400, description?: string) {
  return NextResponse.json(
    { error, ...(description ? { error_description: description } : {}) },
    { status, headers: NO_STORE },
  );
}

function tokenResponse(t: IssuedTokens) {
  return NextResponse.json(
    {
      access_token: t.accessToken,
      token_type: "Bearer",
      expires_in: t.expiresInSeconds,
      refresh_token: t.refreshToken,
      scope: t.scope,
    },
    { headers: NO_STORE },
  );
}

/**
 * OAuth 2.0 token endpoint. Public client (no secret) — client_id travels in
 * the body. Supports authorization_code (with PKCE verifier) and refresh_token.
 */
export async function POST(req: NextRequest) {
  // OAuth uses application/x-www-form-urlencoded.
  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await req.text());
  } catch {
    return tokenError("invalid_request", 400, "Could not parse form body.");
  }

  const grantType = form.get("grant_type") ?? "";
  const clientId = form.get("client_id") ?? "";
  const now = new Date();

  if (!clientId) return tokenError("invalid_client", 401, "client_id is required.");

  if (grantType === "authorization_code") {
    const code = form.get("code") ?? "";
    const redirectUri = form.get("redirect_uri") ?? "";
    const codeVerifier = form.get("code_verifier") ?? "";
    if (!code || !redirectUri || !codeVerifier) {
      return tokenError("invalid_request", 400, "Missing code, redirect_uri, or code_verifier.");
    }
    const res = await exchangeAuthCode({ code, clientId, redirectUri, codeVerifier, now });
    if (!res.ok) return tokenError(res.error);
    return tokenResponse(res.tokens);
  }

  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token") ?? "";
    if (!refreshToken) return tokenError("invalid_request", 400, "Missing refresh_token.");
    const res = await refreshTokens({ refreshToken, clientId, now });
    if (!res.ok) return tokenError(res.error);
    return tokenResponse(res.tokens);
  }

  return tokenError("unsupported_grant_type");
}
