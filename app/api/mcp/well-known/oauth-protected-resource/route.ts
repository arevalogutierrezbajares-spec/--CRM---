import { NextResponse, type NextRequest } from "next/server";
import { requestOrigin } from "@/lib/mcp/origin";

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728). Tells an MCP client which
 * authorization server protects /api/mcp. Reached via a rewrite from
 * /.well-known/oauth-protected-resource.
 */
export async function GET(req: NextRequest) {
  const origin = requestOrigin(req.headers);
  return NextResponse.json(
    {
      resource: `${origin}/api/mcp`,
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
      scopes_supported: ["crm.read", "crm.write"],
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
