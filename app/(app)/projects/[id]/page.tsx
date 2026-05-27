import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { HealthBadge } from "@/components/ui/health-badge";
import { DbBanner } from "@/components/db-banner";
import { MilestoneList } from "@/components/projects/milestone-list";
import { TouchList } from "@/components/touches/touch-list";
import { getProject } from "@/db/queries/projects";
import { listTouchesForProject } from "@/db/queries/touches";
import { safeRead } from "@/lib/db-status";
import { formatDate, formatRelative } from "@/lib/utils";
import { computeHealth } from "@/lib/health";

type Params = Promise<{ id: string }>;

const statusVariant: Record<
  "active" | "waiting" | "done" | "lost",
  "default" | "warning" | "success" | "secondary"
> = {
  active: "default",
  waiting: "warning",
  done: "success",
  lost: "secondary",
};

export default async function ProjectDetailPage(props: { params: Params }) {
  const user = await requireUser();
  const { id } = await props.params;

  const [projectRes, touchesRes] = await Promise.all([
    safeRead(() => getProject({ id, workspaceId: user.workspaceId }), null),
    safeRead(() => listTouchesForProject({ projectId: id, workspaceId: user.workspaceId }), []),
  ]);

  if (projectRes.ok && !projectRes.data) notFound();
  const project = projectRes.data;

  const currentStage = project?.stages.find((s) => s.id === project.currentStageId);

  return (
    <>
      <TopBar
        email={user.email}
        displayName={user.displayName}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={`/projects/${id}/edit`}>
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          </Button>
        }
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <ChevronLeft className="h-4 w-4" /> All projects
        </Link>

        {!projectRes.ok && (
          <div className="mt-4">
            <DbBanner error={projectRes.error} />
          </div>
        )}

        {project && (
          <>
            <header className="mt-4 mb-6">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {project.title}
                </h1>
                <Badge variant={statusVariant[project.status]}>
                  {project.status}
                </Badge>
                <HealthBadge
                  health={computeHealth({
                    status: project.status,
                    expectedUnblockDate: project.expectedUnblockDate,
                    milestones: project.milestones.map((m) => ({
                      status: m.status,
                      dueDate: m.dueDate,
                    })),
                  })}
                />
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-sm text-[var(--muted-foreground)]">
                {project.templateName && <span>{project.templateName}</span>}
                {currentStage && <span>· stage: {currentStage.name}</span>}
                {project.dueDate && <span>· due {formatDate(project.dueDate)}</span>}
              </div>
              {project.status === "waiting" && project.waitingOn && (
                <div className="mt-2 rounded-md border border-[var(--health-amber)]/40 bg-[var(--health-amber)]/10 px-3 py-2 text-sm text-[var(--health-amber)]">
                  Waiting on: <strong>{project.waitingOn}</strong>
                  {project.expectedUnblockDate && (
                    <> · expected {formatDate(project.expectedUnblockDate)}</>
                  )}
                </div>
              )}
            </header>

            <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Milestones</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <MilestoneList
                      projectId={project.id}
                      milestones={project.milestones.map((m) => ({
                        id: m.id,
                        title: m.title,
                        status: m.status,
                        dueDate: m.dueDate,
                        blockerText: m.blockerText,
                        order: m.order,
                      }))}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Timeline</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!touchesRes.ok ? (
                      <DbBanner error={touchesRes.error} />
                    ) : (
                      <TouchList touches={touchesRes.data} />
                    )}
                  </CardContent>
                </Card>
              </div>

              <aside className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Linked contacts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {project.contacts.length === 0 ? (
                      <p className="text-sm text-[var(--muted-foreground)]">
                        None linked.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {project.contacts.map((c) => (
                          <li key={c.id} className="text-sm">
                            <Link
                              href={`/contacts/${c.id}`}
                              className="font-medium hover:underline"
                            >
                              {c.name}
                            </Link>
                            <div className="text-xs text-[var(--muted-foreground)]">
                              {c.relationshipType}
                              {c.organization ? ` · ${c.organization}` : ""}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <Row label="Notes path" value={project.notesPath ?? "—"} />
                    <Row label="Created" value={formatRelative(project.createdAt)} />
                    <Row label="Updated" value={formatRelative(project.updatedAt)} />
                    <Separator />
                    <Row
                      label="Stages"
                      value={project.stages.length || "—"}
                    />
                    <Row
                      label="Milestones"
                      value={project.milestones.length}
                    />
                  </CardContent>
                </Card>
              </aside>
            </div>
          </>
        )}
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </span>
      <span className="truncate text-right">{value}</span>
    </div>
  );
}
