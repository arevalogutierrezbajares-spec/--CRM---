import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "./set-password-form";

// Reached after an email-verified magic link (first-time setup, forgot, or
// change). Standalone — only needs a Supabase session, not a workspace — so it
// works for brand-new invitees who haven't joined a workspace yet.
export default async function SetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/set-password");

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--background)] p-4">
      <SetPasswordForm email={user.email ?? ""} />
    </main>
  );
}
