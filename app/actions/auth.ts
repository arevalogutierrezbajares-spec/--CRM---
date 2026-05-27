"use server";

import { redirect } from "next/navigation";
import { eq, ilike } from "drizzle-orm";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { db, schema } from "@/db";

const { users } = schema;

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
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

  const [member] = await db
    .select({ id: users.id })
    .from(users)
    .where(ilike(users.email, email))
    .limit(1);

  if (!member) {
    return {
      ok: false,
      error:
        "This address isn't on the invite list. Ask the workspace owner to invite you.",
    };
  }

  // Derive the absolute callback URL from the incoming request so it works
  // on localhost, preview, and prod alike without an env round-trip.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const redirectTo = `${proto}://${host}/auth/callback`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
