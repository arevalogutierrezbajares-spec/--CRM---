import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HealthBadge } from "@/components/ui/health-badge";
import { DashBadge } from "@/components/dashboard/shared/badge";
import { DbBanner } from "@/components/db-banner";
import { ProjectTasks } from "@/components/projects/project-tasks";
import { getProject } from "@/db/queries/projects";
import { listWorkspaceMembers } from "@/db/queries/team";
import { safeRead } from "@/lib/db-status";
import { formatDate } from "@/lib/utils";
import { computeHealth } from "@/lib/health";

type Params = Promise<{ id: string }>;

const STATUS_VARIANT: Record<
  "active" | "waiting" | "done" | "lost",
  "blue" | "amber" | "green" | "neutral"
> = {
  active: "blue",
  waiting: "amber",
  done: "green",
  lost: "neutral",
};

export default async function ProjectDetailPage(props: { params: Params }) {
  const user = await requireUser();
  const { id } = await props.params;

  const projectRes = await safeRead(
    () => getProject({ id, workspaceId: user.workspaceId }),
    null,
  );
  if (projectRes.ok && !projectRes.data) notFound();
  const project = projectRes.data;
  if (!project) {
    return (
      <main className="p-6">
        <DbBanner error={(projectRes as { error?: string }).error ?? ""} />
      </main>
    );
  }

  const health = computeHealth({
    status: project.status,
    expectedUnblockDate: project.expectedUnblockDate,
    milestones: project.milestones.map((m) => ({
      status: m.status,
      dueDate: m.dueDate,
    })),
  });
  const membersRes = await safeRead(() => listWorkspaceMembers(user.workspaceId), []);

  return (
    <>
      <TopBar
        email={user.email}
        displayName={user.displayName}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={`/projects/${project.id}/edit`}>
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          </Button>
        }
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-6 space-y-4">
        <Link
          href={`/lob/${project.lobId}`}
          className="inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary"
        >
          <ChevronLeft className="h-4 w-4" /> {project.lobTitle}
        </Link>

        <div
          className="rounded-xl border px-6 py-5"
          style={{ borderColor: "var(--border-default)" }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-[22px] font-medium tracking-tight text-text-primary">
              {project.title}
            </h1>
            <DashBadge variant={STATUS_VARIANT[project.status]}>
              {project.status}
            </DashBadge>
            <HealthBadge health={health} short />
          </div>
          <div className="mt-2 flex items-center gap-4 flex-wrap text-tiny text-text-tertiary">
            <span>
              part of{" "}
              <Link
                href={`/lob/${project.lobId}`}
                className="text-text-secondary hover:text-text-primary"
              >
                {project.lobTitle}
              </Link>
            </span>
            {project.dueDate && <span>due {formatDate(project.dueDate)}</span>}
          </div>
          {project.status === "waiting" && project.waitingOn && (
            <p className="mt-3 text-tiny" style={{ color: "var(--amber-text)" }}>
              ⏸ Waiting on: <strong>{project.waitingOn}</strong>
              {project.expectedUnblockDate && (
                <> · expected {formatDate(project.expectedUnblockDate)}</>
              )}
            </p>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <ProjectTasks
              projectId={project.id}
              tasks={project.milestones.map((m) => ({
                id: m.id,
                title: m.title,
                description: m.description ?? null,
                status: m.status,
                dueDate: m.dueDate,
                priority: m.priority ?? null,
                assignedTo: m.assignedTo ?? null,
              }))}
              members={membersRes.data.map((member) => ({
                userId: member.userId,
                displayName: member.displayName,
              }))}
            />
          </CardContent>
        </Card>

      </main>
    </>
  );
}
