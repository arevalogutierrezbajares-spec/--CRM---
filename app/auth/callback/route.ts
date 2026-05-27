import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth callback handles two flows:
 *
 * 1. PKCE flow (?code=…) — from supabase.auth.signInWithOtp() called
 *    server-side via @supabase/ssr. The code is exchanged for a session
 *    via exchangeCodeForSession.
 *
 * 2. verifyOtp / TokenHash flow (?token_hash=…&type=magiclink) — our
 *    magic-link email template builds this URL. Uses verifyOtp which
 *    sets cookies server-side. Avoids the broken implicit-flow path
 *    (which writes #access_token to the URL hash and depends on the JS
 *    client being able to verify HS256 JWTs via JWKS — not possible).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next") ?? "/";
  const supabase = await createClient();

  // PKCE flow
  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
    return NextResponse.redirect(
      new URL(`/login?error=pkce_${encodeURIComponent(error.message)}`, url.origin),
    );
  }

  // TokenHash flow (Supabase verifyOtp)
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  if (token_hash && type) {
    // Per Supabase docs, the "email" type is the umbrella for magiclink+signup
    // when using token_hash. Map "magiclink" → "email" to avoid mismatches
    // with newer GoTrue builds that consolidated the verification surface.
    const otpType = (type === "magiclink" ? "email" : type) as
      | "email"
      | "signup"
      | "recovery"
      | "email_change"
      | "invite";
    const { error } = await supabase.auth.verifyOtp({
      type: otpType,
      token_hash,
    });
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
    return NextResponse.redirect(
      new URL(`/login?error=otp_${encodeURIComponent(error.message)}`, url.origin),
    );
  }

  return NextResponse.redirect(new URL("/login?error=auth_no_params", url.origin));
}
