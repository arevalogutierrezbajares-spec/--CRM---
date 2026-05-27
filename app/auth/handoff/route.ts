import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Receives access_token + refresh_token (originally from the URL hash of
 * an implicit-flow magic link) and exchanges them for server-side cookies
 * via @supabase/ssr.
 *
 * Why this exists: when Supabase's magic-link email uses the default
 * implicit flow ({{ .ConfirmationURL }}), the verified tokens land in the
 * URL hash (#access_token=…). Hash fragments aren't sent to the server,
 * so the client has to forward them. setSession() in the BROWSER fails on
 * Supabase projects with HS256 signing keys (the symmetric secret can't be
 * published in JWKS for client-side verification). Doing the same
 * operation SERVER-SIDE just writes the cookies — no client-side
 * verification path.
 */
export async function POST(req: NextRequest) {
  let body: { access_token?: string; refresh_token?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "expected json body" }, { status: 400 });
  }
  const { access_token, refresh_token } = body;
  if (!access_token || !refresh_token) {
    return NextResponse.json({ ok: false, error: "missing tokens" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
