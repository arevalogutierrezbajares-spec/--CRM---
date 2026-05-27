import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Target } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import { ProgressBar } from "@/components/dashboard/shared/progress-bar";
import { WorkNav } from "@/components/work/work-nav";
import {
  InitiativeStatusBadge,
  WorkPriorityBadge,
  WorkStatusBadge,
} from "@/components/work/priority-badge";
import { ThemeChips } from "@/components/work/theme-chips";
import { getInitiative, listWorkTasks } from "@/db/queries/work";

type Params = Promise<{ id: string }>;

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default async function InitiativeDetailPage(props: { params: Params }) {
  const user = await requireUser();
  const { id } = await props.params;

  const init = await getInitiative({ id, workspaceId: user.workspaceId });
  if (!init) notFound();

  const tasks = await listWorkTasks({
    workspaceId: user.workspaceId,
    initiativeId: id,
    limit: 200,
  }).catch(() => []);

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-6 space-y-4">
        <Link
          href="/initiatives"
          className="inline-flex items-center gap-1 text-[13px] text-text-secondary hover:text-text-primary"
        >
          <ChevronLeft size={14} /> Initiatives
        </Link>

        <header className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-[22px] font-medium tracking-tight">
                {init.title}
              </h1>
              {init.summary && (
                <p className="text-[13px] text-text-secondary mt-1">
                  {init.summary}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <InitiativeStatusBadge status={init.status} />
              <WorkPriorityBadge priority={init.priority} />
            </div>
          </div>

          {init.themes.length > 0 && <ThemeChips themes={init.themes} />}
        </header>

        <WorkNav />

        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            {init.goal && (
              <DashCard>
                <SectionLabel icon={Target}>Goal</SectionLabel>
                <p className="text-[13px] text-text-primary whitespace-pre-wrap leading-relaxed">
                  {init.goal}
                </p>
              </DashCard>
            )}

            <DashCard>
              <SectionLabel
                right={
                  <span className="text-tiny text-text-tertiary tabular-nums">
                    {init.taskDoneCount}/{init.taskCount}
                  </span>
                }
              >
                Tasks ({init.progressPct}%)
              </SectionLabel>
              <ProgressBar pct={init.progressPct} className="mb-3" />
              {tasks.length === 0 ? (
                <p className="text-[12px] text-text-secondary py-2">
                  No tasks assigned to this initiative yet. Tag milestones with this initiative on the project page.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {tasks.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center gap-2 rounded px-1 py-1 hover:bg-surface"
                    >
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/projects/${t.projectId}`}
                          className="text-[12.5px] text-text-primary hover:underline truncate block"
                        >
                          {t.title}
                        </Link>
                        <div className="text-tiny text-text-tertiary truncate">
                          {t.projectTitle}
                          {t.assigneeName ? ` · ${t.assigneeName}` : ""}
                          {t.dueDate ? ` · due ${shortDate(t.dueDate)}` : ""}
                        </div>
                      </div>
                      <WorkPriorityBadge priority={t.priority} />
                      <WorkStatusBadge status={t.status} />
                    </li>
                  ))}
                </ul>
              )}
            </DashCard>
          </div>

          <aside className="space-y-3">
            <DashCard>
              <SectionLabel>Schedule</SectionLabel>
              <dl className="space-y-1 text-[12px]">
                <Row label="Started" value={shortDate(init.startDate)} />
                <Row label="Target" value={shortDate(init.targetEndDate)} />
                {init.actualEndDate && (
                  <Row label="Closed" value={shortDate(init.actualEndDate)} />
                )}
              </dl>
            </DashCard>

            <DashCard>
              <SectionLabel>Context</SectionLabel>
              <dl className="space-y-1 text-[12px]">
                <Row label="Venture" value={init.projectTitle ?? "Cross-venture"} />
                <Row label="Owner" value={init.ownerName ?? "—"} />
                <Row label="Health" value={init.healthColor} />
              </dl>
            </DashCard>
          </aside>
        </div>
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-text-tertiary">{label}</dt>
      <dd className="text-text-primary">{value}</dd>
    </div>
  );
}
