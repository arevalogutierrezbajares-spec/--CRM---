import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
};

/**
 * Local-only bypass for UI screenshots / dev-mode exploration. Returns a fake
 * user iff *both* preconditions hold:
 *   - NODE_ENV === "development"  (build-time)
 *   - AGB_DEV_FAKE_USER === "1"   (runtime opt-in)
 * Cannot fire in `next start` / Vercel / any production build. The env var is
 * NOT exposed via `NEXT_PUBLIC_*` so it stays server-side.
 */
function devFakeUser(): SessionUser | null {
  if (process.env.NODE_ENV !== "development") return null;
  if (process.env.AGB_DEV_FAKE_USER !== "1") return null;
  return {
    id: "00000000-0000-0000-0000-000000000000",
    email: "dev@local",
    displayName: "Dev Founder",
  };
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const fake = devFakeUser();
  if (fake) return fake;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const displayName =
    (user.user_metadata?.display_name as string | undefined) ??
    user.email?.split("@")[0] ??
    "Founder";
  return {
    id: user.id,
    email: user.email ?? "",
    displayName,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
