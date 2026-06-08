import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectForm } from "@/components/projects/project-form";
import { DbBanner } from "@/components/db-banner";
import { getProject } from "@/db/queries/projects";
import { listLines } from "@/db/queries/lines-of-business";
import { safeRead } from "@/lib/db-status";
import { updateProject } from "../../actions";

type Params = Promise<{ id: string }>;

export default async function EditProjectPage(props: { params: Params }) {
  const user = await requireUser();
  const { id } = await props.params;

  const [projectRes, lobsRes] = await Promise.all([
    safeRead(() => getProject({ id, workspaceId: user.workspaceId }), null),
    safeRead(
      () => listLines({ workspaceId: user.workspaceId, topLevelOnly: false }),
      [],
    ),
  ]);

  if (projectRes.ok && !projectRes.data) notFound();
  const project = projectRes.data;

  async function action(formData: FormData) {
    "use server";
    return updateProject(id, null, formData);
  }

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        <Link
          href={`/projects/${id}`}
          className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ChevronLeft className="h-4 w-4" /> Back to project
        </Link>
        <header className="mt-4 mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Edit {project?.title ?? "project"}
          </h1>
        </header>

        {!projectRes.ok && <DbBanner error={projectRes.error} />}

        <Card>
          <CardContent className="pt-6">
            <ProjectForm
              lobs={lobsRes.data.map((l) => ({ id: l.id, title: l.title }))}
              initial={
                project
                  ? {
                      id: project.id,
                      lobId: project.lobId,
                      title: project.title,
                      status: project.status,
                      dueDate: project.dueDate,
                      waitingOn: project.waitingOn,
                      expectedUnblockDate: project.expectedUnblockDate,
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
