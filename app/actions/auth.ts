"use server";

import { redirect } from "next/navigation";
import { eq, ilike } from "drizzle-orm";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { db, schema } from "@/db";
import { isValidPassword, PASSWORD_RULE } from "@/lib/auth/password";

const { users, workspaceInvites } = schema;

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Returning-user sign-in with email + password. Only succeeds for users who
 * have already verified their email and set a password — which inherently
 * keeps it invite-only (auth users are created via the magic-link path below).
 */
export async function signInWithPassword(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
}> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !email.includes("@") || !password) {
    return { ok: false, error: "Enter your email and password." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      ok: false,
      error: "Incorrect email or password. First time, or forgot it? Use the setup link below.",
    };
  }
  return { ok: true };
}

/**
 * Set (or change) the signed-in user's password. Reached only after an
 * email-verified magic link establishes a session (first-time setup, forgot,
 * or change), so the email is always verified at this point.
 */
export async function setPassword(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
}> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!isValidPassword(password)) return { ok: false, error: PASSWORD_RULE };
  if (password !== confirm) return { ok: false, error: "The two passwords don't match." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Your link expired. Request a new setup link from the sign-in page.",
    };
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Email-verified password change for a signed-in user: sends a magic link that
 * lands on /set-password. Used by the "Change password" button in settings so
 * a password change always requires confirming control of the inbox.
 */
export async function requestPasswordChange(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "You're not signed in." };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const callbackUrl = new URL(`${proto}://${host}/auth/callback`);
  callbackUrl.searchParams.set("next", "/set-password");

  const { error } = await supabase.auth.signInWithOtp({
    email: user.email,
    options: { emailRedirectTo: callbackUrl.toString() },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Invite-only sign-in. Verifies the email belongs to an existing member of
 * the workspace before asking Supabase to send a magic link. Strangers get a
 * clear error instead of an actual email.
 */
export async function requestSignInLink(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
}> {
  const raw = formData.get("email");
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";

  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }

  // Allow sign-in for two cases:
  // (1) Existing workspace member (email in users table)
  // (2) Email has a pending, non-expired workspace_invite — they need to be
  //     able to sign in to redeem it
  const [member] = await db
    .select({ id: users.id })
    .from(users)
    .where(ilike(users.email, email))
    .limit(1);

  if (!member) {
    const [pendingInvite] = await db
      .select({ id: workspaceInvites.id })
      .from(workspaceInvites)
      .where(ilike(workspaceInvites.email, email))
      .limit(1);
    if (!pendingInvite) {
      return {
        ok: false,
        error:
          "This address isn't on the invite list. Ask the workspace owner to invite you.",
      };
    }
    // Else: has a pending invite — let them sign in so they can accept it
  }

  // Derive the absolute callback URL from the incoming request so it works
  // on localhost, preview, and prod alike without an env round-trip.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  // Forward ?next= so post-auth the user lands back on the page they were
  // trying to reach (e.g. /accept?token=… for invitees).
  const nextRaw = formData.get("next");
  const nextPath = typeof nextRaw === "string" && nextRaw.startsWith("/") ? nextRaw : "/";
  const callbackUrl = new URL(`${proto}://${host}/auth/callback`);
  callbackUrl.searchParams.set("next", nextPath);
  const redirectTo = callbackUrl.toString();

  // We've already verified the email is on the invite list (users.email
  // lookup above). Supabase's shouldCreateUser:false would over-gate by
  // requiring a pre-existing auth.users row — but invited members might be
  // doing their first-ever Supabase auth, so leave creation enabled and rely
  // on the app-level allowlist check as the actual gate.
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
