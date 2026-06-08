import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectForm } from "@/components/lob/project-form";
import { DbBanner } from "@/components/db-banner";
import { listTemplates } from "@/db/queries/lines-of-business";
import { listContacts } from "@/db/queries/contacts";
import { safeRead } from "@/lib/db-status";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { createLob } from "../actions";

export default async function NewProjectPage() {
  const user = await requireUser();

  const [templatesRes, contactsRes] = await Promise.all([
    safeRead(async () => {
      const tpl = await listTemplates();
      const counts = await db
        .select({ templateId: schema.pipelineStages.templateId })
        .from(schema.pipelineStages);
      return tpl.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        stageCount: counts.filter((c) => c.templateId === t.id).length,
      }));
    }, [] as { id: string; name: string; description: string | null; stageCount: number }[]),
    safeRead(
      () => listContacts({ workspaceId: user.workspaceId }),
      [] as Awaited<ReturnType<typeof listContacts>>,
    ),
  ]);
  // (eq import is only used implicitly via @/db/queries; keep to avoid tree-shake)
  void eq;

  async function action(formData: FormData) {
    "use server";
    return createLob(null, formData);
  }

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        <Link
          href="/lob"
          className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ChevronLeft className="h-4 w-4" /> Back to lines of business
        </Link>
        <header className="mt-4 mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            New line of business
          </h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Pick a pipeline template — its stages drive the venture pipeline.
          </p>
        </header>

        {!templatesRes.ok && <DbBanner error={templatesRes.error} />}

        <Card>
          <CardContent className="pt-6">
            <ProjectForm
              templates={templatesRes.data}
              contacts={contactsRes.data.map((c) => ({ id: c.id, name: c.name }))}
              action={action}
              submitLabel="Create line of business"
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
