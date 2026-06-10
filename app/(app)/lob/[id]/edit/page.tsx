import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectForm } from "@/components/lob/project-form";
import { DbBanner } from "@/components/db-banner";
import {
  getLob,
  listBusinesses,
  listBusinessLinks,
  listTemplates,
} from "@/db/queries/lines-of-business";
import { listContacts } from "@/db/queries/contacts";
import { safeRead } from "@/lib/db-status";
import { updateLob } from "../../actions";

type Params = Promise<{ id: string }>;

export default async function EditProjectPage(props: { params: Params }) {
  const user = await requireUser();
  const { id } = await props.params;

  const [projectRes, templatesRes, contactsRes, businessesRes, linkedRes] = await Promise.all([
    safeRead(() => getLob({ id, workspaceId: user.workspaceId }), null),
    safeRead(
      () => listTemplates(),
      [] as Awaited<ReturnType<typeof listTemplates>>,
    ),
    safeRead(
      () => listContacts({ workspaceId: user.workspaceId }),
      [] as Awaited<ReturnType<typeof listContacts>>,
    ),
    safeRead(
      () => listBusinesses(user.workspaceId),
      [] as Awaited<ReturnType<typeof listBusinesses>>,
    ),
    safeRead(
      () => listBusinessLinks(id, user.workspaceId),
      [] as Awaited<ReturnType<typeof listBusinessLinks>>,
    ),
  ]);

  if (projectRes.ok && !projectRes.data) notFound();
  const project = projectRes.data;
  // Business linking applies only to projects (the businesses themselves
  // don't roll up to anything).
  const isProject = project?.kind === "project";

  async function action(formData: FormData) {
    "use server";
    return updateLob(id, null, formData);
  }

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        <Link
          href={`/lob/${id}`}
          className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </Link>
        <header className="mt-4 mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Edit {project?.title ?? "project"}
          </h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Template is set at creation and locked — milestones live on the
            project itself.
          </p>
        </header>

        {!projectRes.ok && <DbBanner error={projectRes.error} />}

        <Card>
          <CardContent className="pt-6">
            <ProjectForm
              templateLocked
              templates={templatesRes.data.map((t) => ({
                id: t.id,
                name: t.name,
                description: t.description,
              }))}
              contacts={contactsRes.data.map((c) => ({ id: c.id, name: c.name }))}
              businesses={
                isProject
                  ? businessesRes.data.map((b) => ({
                      id: b.id,
                      title: b.title,
                      coverEmoji: b.coverEmoji,
                    }))
                  : undefined
              }
              initial={
                project
                  ? {
                      id: project.id,
                      title: project.title,
                      status: project.status,
                      templateId: project.templateId,
                      contactIds: project.contacts.map((c) => c.id),
                      businessIds: linkedRes.data.map((b) => b.id),
                      dueDate: project.dueDate,
                      waitingOn: project.waitingOn,
                      expectedUnblockDate: project.expectedUnblockDate,
                      notesPath: project.notesPath,
                    }
                  : undefined
              }
              action={action}
              submitLabel="Save changes"
            />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
