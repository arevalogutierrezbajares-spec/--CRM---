import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes that must NOT redirect to /login — they're called by external
// systems that authenticate per-request (HMAC signature, query secret,
// Bearer CRON_SECRET, etc.) rather than via a Supabase session cookie.
const PUBLIC_PATHS = [
  "/login",
  "/auth/callback",
  "/auth/handoff", // implicit-flow magic-link → server-side session establishment
  "/api/health",
  "/api/whatsapp/webhook", // Meta — verifies via WA_VERIFY_TOKEN + HMAC
  "/api/postmark/inbound", // Postmark — verifies via ?secret= query
  "/api/cron/", // Vercel Cron — verifies via Authorization: Bearer CRON_SECRET
];

export async function updateSession(request: NextRequest) {
  // Magic-link recovery: if Supabase's email link returned the user to a
  // path other than /auth/callback (happens when our redirectTo wasn't on
  // Supabase's allowlist and it fell back to Site URL), but there's still
  // a ?code=… param, reroute to the callback so the session exchange runs.
  // This keeps sign-in working even when Supabase URL config is out of date.
  const incomingCode = request.nextUrl.searchParams.get("code");
  if (incomingCode && request.nextUrl.pathname !== "/auth/callback") {
    const url = request.nextUrl.clone();
    const next = url.searchParams.get("next") ?? "/";
    url.pathname = "/auth/callback";
    url.search = `?code=${encodeURIComponent(incomingCode)}&next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(url);
  }

  // Dev-only bypass — see lib/current-user.ts. Cannot fire in production
  // (gated by both NODE_ENV and an explicit env opt-in).
  if (
    process.env.NODE_ENV === "development" &&
    process.env.AGB_DEV_FAKE_USER === "1"
  ) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options?: CookieOptions }[],
        ) {
          cookiesToSet.forEach(({ name, value }: { name: string; value: string }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(
            ({ name, value, options }: { name: string; value: string; options?: CookieOptions }) =>
              supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
