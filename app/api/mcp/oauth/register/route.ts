import { NextResponse, type NextRequest } from "next/server";
import { registerClient } from "@/lib/mcp/oauth.server";

/**
 * OAuth 2.0 Dynamic Client Registration (RFC 7591). Claude Code POSTs its
 * redirect URIs the first time a user connects; we store the client and hand
 * back a public client_id (PKCE public client, no secret).
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Body must be JSON." },
      { status: 400 },
    );
  }

  const meta = (body ?? {}) as Record<string, unknown>;
  const redirectUris = Array.isArray(meta.redirect_uris)
    ? meta.redirect_uris.filter((u): u is string => typeof u === "string")
    : [];

  if (redirectUris.length === 0) {
    return NextResponse.json(
      {
        error: "invalid_redirect_uri",
        error_description: "At least one redirect_uri is required.",
      },
      { status: 400 },
    );
  }

  const clientName =
    typeof meta.client_name === "string" ? meta.client_name : null;

  const { clientId } = await registerClient({ clientName, redirectUris });

  return NextResponse.json(
    {
      client_id: clientId,
      client_name: clientName ?? undefined,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201 },
  );
}
