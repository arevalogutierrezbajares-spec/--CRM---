/**
 * Shared helpers for the capture-authed REST surface used by the macOS helper.
 *
 * Every `/api/capture/*` route resolves the founder-scoped `agbcap_` bearer
 * token to a workspace identity exactly like `app/api/capture/ping/route.ts`.
 * This wraps that two-line dance + JSON-body parsing so the Town Hall routes
 * stay uniform.
 */
import { NextResponse, type NextRequest } from "next/server";
import { resolveCaptureToken, type CaptureIdentity } from "@/lib/capture/tokens";

/** 401 JSON response — the helper surfaces this as "reconnect" (FR-CALL-OPS-2). */
export const UNAUTHORIZED = NextResponse.json({ error: "Unauthorized" }, { status: 401 });

/**
 * Resolve the bearer token. Returns the identity, or a ready-to-return 401
 * `NextResponse`. Callers do:
 *
 *   const auth = await requireCaptureIdentity(req);
 *   if (auth instanceof NextResponse) return auth;
 *   // auth is the CaptureIdentity
 */
export async function requireCaptureIdentity(
  req: NextRequest,
): Promise<CaptureIdentity | NextResponse> {
  const identity = await resolveCaptureToken(req.headers.get("authorization"));
  if (!identity) return UNAUTHORIZED;
  return identity;
}

/** Parse a JSON body, returning the value or a 400 `NextResponse`. */
export async function readJson(req: NextRequest): Promise<unknown | NextResponse> {
  try {
    return await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
