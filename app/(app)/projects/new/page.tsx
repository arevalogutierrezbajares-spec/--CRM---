import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectForm } from "@/components/projects/project-form";
import { DbBanner } from "@/components/db-banner";
import { listLines } from "@/db/queries/lines-of-business";
import { safeRead } from "@/lib/db-status";
import { createProject } from "../actions";

type SearchParams = Promise<{ lob?: string }>;

export default async function NewProjectPage(props: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const sp = await props.searchParams;

  const lobsRes = await safeRead(
    () => listLines({ workspaceId: user.workspaceId, topLevelOnly: false }),
    [],
  );

  async function action(formData: FormData) {
    "use server";
    return createProject(null, formData);
  }

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        <Link
          href={sp.lob ? `/lob/${sp.lob}` : "/lob"}
          className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </Link>
        <header className="mt-4 mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">New project</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            A project rolls up to a line of business. Milestones, finance, and
            meetings attach to it.
          </p>
        </header>

        {!lobsRes.ok && <DbBanner error={lobsRes.error} />}

        <Card>
          <CardContent className="pt-6">
            <ProjectForm
              lobs={lobsRes.data.map((l) => ({ id: l.id, title: l.title }))}
              lobLocked={Boolean(sp.lob)}
              initial={sp.lob ? { lobId: sp.lob } : undefined}
              action={action}
              submitLabel="Create project"
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
