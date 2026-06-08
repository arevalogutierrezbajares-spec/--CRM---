import { NextResponse, type NextRequest } from "next/server";
import { requestOrigin } from "@/lib/mcp/origin";

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414). Advertises the endpoints
 * an MCP client uses to register, authorize (PKCE), and exchange tokens.
 * Reached via a rewrite from /.well-known/oauth-authorization-server.
 */
export async function GET(req: NextRequest) {
  const origin = requestOrigin(req.headers);
  return NextResponse.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/api/mcp/oauth/authorize`,
      token_endpoint: `${origin}/api/mcp/oauth/token`,
      registration_endpoint: `${origin}/api/mcp/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["crm.read", "crm.write"],
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
