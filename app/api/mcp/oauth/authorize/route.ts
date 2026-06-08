import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/current-user";
import { getClient, issueAuthCode, MCP_SCOPE } from "@/lib/mcp/oauth.server";
import { requestOrigin } from "@/lib/mcp/origin";

const { workspaces } = schema;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type AuthParams = {
  responseType: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  scope: string;
  resource: string;
};

function readParams(sp: URLSearchParams): AuthParams {
  return {
    responseType: sp.get("response_type") ?? "",
    clientId: sp.get("client_id") ?? "",
    redirectUri: sp.get("redirect_uri") ?? "",
    codeChallenge: sp.get("code_challenge") ?? "",
    codeChallengeMethod: sp.get("code_challenge_method") ?? "",
    state: sp.get("state") ?? "",
    scope: sp.get("scope") ?? MCP_SCOPE,
    resource: sp.get("resource") ?? "",
  };
}

function htmlError(message: string, status = 400) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Authorization error</title>` +
      `<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem">` +
      `<h1 style="font-size:1.25rem">Can't connect</h1><p>${esc(message)}</p></body>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

/**
 * Validate the client + redirect_uri (must be trusted before we ever redirect
 * back), then the rest of the request. Returns either an error Response or the
 * validated client.
 */
async function validate(p: AuthParams) {
  if (!p.clientId || !p.redirectUri) {
    return { error: htmlError("Missing client_id or redirect_uri.") } as const;
  }
  const client = await getClient(p.clientId);
  if (!client) {
    return { error: htmlError("Unknown client_id.") } as const;
  }
  if (!client.redirectUris.includes(p.redirectUri)) {
    return { error: htmlError("redirect_uri is not registered for this client.") } as const;
  }
  return { client } as const;
}

/** Build a redirect back to the client with an OAuth error (or success code). */
function redirectBack(redirectUri: string, params: Record<string, string>) {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  return NextResponse.redirect(url, { status: 302 });
}

export async function GET(req: NextRequest) {
  const p = readParams(req.nextUrl.searchParams);
  const v = await validate(p);
  if ("error" in v) return v.error;

  // PKCE is mandatory.
  if (p.codeChallengeMethod !== "S256" || !p.codeChallenge) {
    return redirectBack(p.redirectUri, {
      error: "invalid_request",
      error_description: "PKCE S256 code_challenge is required.",
      state: p.state,
    });
  }
  if (p.responseType !== "code") {
    return redirectBack(p.redirectUri, {
      error: "unsupported_response_type",
      state: p.state,
    });
  }

  // Must be signed into the CRM. If not, bounce through the normal login flow
  // and come back to this exact authorize URL. The login page only honors a
  // RELATIVE next (it enforces next.startsWith("/")), so pass the path+query,
  // not an absolute URL — otherwise it silently falls back to "/".
  const user = await getCurrentUser();
  if (!user) {
    const origin = requestOrigin(req.headers);
    const relativeNext = `/api/mcp/oauth/authorize${req.nextUrl.search}`;
    const login = new URL(`${origin}/login`);
    login.searchParams.set("next", relativeNext);
    return NextResponse.redirect(login, { status: 302 });
  }

  const [ws] = await db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, user.workspaceId))
    .limit(1);
  const wsName = ws?.name ?? "your workspace";
  const clientName = v.client.clientName || "An MCP client (Claude Code)";

  // Minimal consent screen. Approving POSTs back to this same endpoint.
  const hidden = Object.entries({
    response_type: p.responseType,
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    code_challenge: p.codeChallenge,
    code_challenge_method: p.codeChallengeMethod,
    state: p.state,
    scope: p.scope,
    resource: p.resource,
  })
    .map(([k, val]) => `<input type="hidden" name="${esc(k)}" value="${esc(val)}">`)
    .join("");

  const html =
    `<!doctype html><meta charset="utf-8"><title>Connect to AGB CRM</title>` +
    `<body style="font-family:system-ui;max-width:30rem;margin:4rem auto;padding:0 1rem;color:#111">` +
    `<h1 style="font-size:1.35rem;margin-bottom:.25rem">Connect to AGB CRM</h1>` +
    `<p style="color:#555;margin-top:0">Signed in as <strong>${esc(user.email)}</strong></p>` +
    `<p><strong>${esc(clientName)}</strong> wants to read and add data in ` +
    `<strong>${esc(wsName)}</strong> on your behalf (contacts, touches, meetings, ` +
    `tasks, notes).</p>` +
    `<form method="post" style="display:flex;gap:.75rem;margin-top:1.5rem">${hidden}` +
    `<button type="submit" name="decision" value="approve" ` +
    `style="background:#111;color:#fff;border:0;border-radius:.5rem;padding:.6rem 1.1rem;font-size:1rem;cursor:pointer">Approve</button>` +
    `<button type="submit" name="decision" value="deny" ` +
    `style="background:#eee;color:#111;border:0;border-radius:.5rem;padding:.6rem 1.1rem;font-size:1rem;cursor:pointer">Deny</button>` +
    `</form></body>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const sp = new URLSearchParams();
  for (const [k, val] of form.entries()) {
    if (typeof val === "string") sp.set(k, val);
  }
  const p = readParams(sp);
  const decision = sp.get("decision") ?? "";

  const v = await validate(p);
  if ("error" in v) return v.error;

  if (decision !== "approve") {
    return redirectBack(p.redirectUri, { error: "access_denied", state: p.state });
  }
  if (p.codeChallengeMethod !== "S256" || !p.codeChallenge) {
    return redirectBack(p.redirectUri, {
      error: "invalid_request",
      error_description: "PKCE S256 code_challenge is required.",
      state: p.state,
    });
  }

  // Re-confirm the session at decision time (the consent POST carries the
  // Supabase cookie just like the GET did).
  const user = await getCurrentUser();
  if (!user) {
    return redirectBack(p.redirectUri, {
      error: "access_denied",
      error_description: "Not signed in.",
      state: p.state,
    });
  }

  const code = await issueAuthCode({
    clientId: p.clientId,
    userId: user.id,
    workspaceId: user.workspaceId,
    redirectUri: p.redirectUri,
    codeChallenge: p.codeChallenge,
    scope: p.scope || MCP_SCOPE,
    resource: p.resource || null,
    now: new Date(),
  });

  return redirectBack(p.redirectUri, { code, state: p.state });
}
