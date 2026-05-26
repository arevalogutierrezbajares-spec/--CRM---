import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">AGB CRM</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <strong>{user.email}</strong>
        </p>
      </header>

      <section className="space-y-4 rounded-lg border bg-card p-6">
        <h2 className="text-lg font-medium">Welcome</h2>
        <p className="text-sm text-muted-foreground">
          This is the AGB CRM dashboard scaffold. Phase 0 is complete: schema +
          auth + deploy pipeline are live. Phase 1 (Deals as Projects) and
          Phase 2 (dynamic grid + Kanban) come next.
        </p>
        <ul className="list-disc space-y-1 pl-6 text-sm">
          <li>Database: 12 tables across 9 capability areas (incl. MTG)</li>
          <li>Auth: Supabase magic-link, Founder 1 onboarded</li>
          <li>Pipeline templates seeded: Caney (12), VAV (10), BD (5)</li>
        </ul>
      </section>
    </main>
  );
}
