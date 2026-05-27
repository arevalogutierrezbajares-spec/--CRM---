import Link from "next/link";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { DbBanner } from "@/components/db-banner";
import { WorkNav } from "@/components/work/work-nav";
import {
  WorkPriorityBadge,
  WorkStatusBadge,
  InitiativeStatusBadge,
} from "@/components/work/priority-badge";
import { ThemeChips } from "@/components/work/theme-chips";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import { safeRead } from "@/lib/db-status";
import { listWorkTasks, listInitiatives } from "@/db/queries/work";
import { listOverlordTasks, type OverlordTaskWithSection } from "@/db/queries/overlord";
import { OverlordStatusBadge, OverlordPriorityBadge } from "@/components/overlord/status-badge";

type SearchParams = Promise<{
  source?: string;
  status?: string;
  priority?: string;
}>;

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default async function WorkPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const source = sp.source ?? "all"; // all | crm | overlord

  const [tasksRes, initsRes, overlordRes] = await Promise.all([
    safeRead(
      () => listWorkTasks({ workspaceId: user.workspaceId, limit: 200 }),
      [],
    ),
    safeRead(() => listInitiatives({ workspaceId: user.workspaceId }), []),
    safeRead<OverlordTaskWithSection[]>(
      () =>
        listOverlordTasks({
          workspaceId: user.workspaceId,
          status: sp.status,
          priority: sp.priority,
          limit: 200,
        }),
      [],
    ),
  ]);

  const showCrm = source === "all" || source === "crm";
  const showOverlord = source === "all" || source === "overlord";

  const activeInitiatives = initsRes.data.filter((i) => i.status === "active");
  const crmTaskCount = tasksRes.data.filter(
    (t) => t.status !== "done" && t.status !== "cancelled",
  ).length;
  const overlordActive = overlordRes.data.filter(
    (t) =>
      t.status === "todo" ||
      t.status === "in_progress" ||
      t.status === "in_review" ||
      t.status === "blocked",
  ).length;

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 space-y-4">
        <header>
          <h1 className="text-[22px] font-medium tracking-tight">Work</h1>
          <p className="text-[13px] text-text-secondary">
            All open work across CRM milestones + Overlord agent tasks.
          </p>
        </header>

        <WorkNav />

        {!tasksRes.ok && (
          <DbBanner error={(tasksRes as { error?: string }).error ?? ""} />
        )}

        {/* Source filter */}
        <div
          className="flex items-center gap-2 border-b pb-2"
          style={{ borderColor: "var(--border-default)" }}
        >
          <SourcePill href="/work" label="All" count={crmTaskCount + overlordActive} active={source === "all"} />
          <SourcePill href="/work?source=crm" label="CRM" count={crmTaskCount} active={source === "crm"} />
          <SourcePill href="/work?source=overlord" label="Overlord" count={overlordActive} active={source === "overlord"} />
        </div>

        {/* Active initiatives summary */}
        {activeInitiatives.length > 0 && showCrm && (
          <DashCard>
            <SectionLabel>Active initiatives</SectionLabel>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {activeInitiatives.map((init) => (
                <Link
                  key={init.id}
                  href={`/initiatives/${init.id}`}
                  className="rounded-md border bg-card p-2.5 hover:bg-surface transition-colors"
                  style={{ borderColor: "var(--border-default)" }}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="text-[12.5px] font-medium text-text-primary line-clamp-1">
                      {init.title}
                    </div>
                    <InitiativeStatusBadge status={init.status} />
                  </div>
                  <div className="text-tiny text-text-tertiary mt-1 tabular-nums">
                    {init.progressPct}% · {init.taskDoneCount}/{init.taskCount}
                  </div>
                </Link>
              ))}
            </div>
          </DashCard>
        )}

        {/* CRM tasks */}
        {showCrm && (
          <DashCard>
            <SectionLabel
              right={
                <span className="text-tiny text-text-tertiary tabular-nums">
                  {crmTaskCount}
                </span>
              }
            >
              CRM milestones
            </SectionLabel>
            {tasksRes.data.length === 0 ? (
              <p className="text-[12px] text-text-secondary py-2">
                No CRM tasks. Create milestones on projects.
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--border-default)" }}>
                {tasksRes.data
                  .filter((t) => t.status !== "done" && t.status !== "cancelled")
                  .slice(0, 50)
                  .map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center gap-2 py-2"
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
                          {t.initiativeTitle && ` · ${t.initiativeTitle}`}
                          {t.dueDate && ` · ${shortDate(t.dueDate)}`}
                        </div>
                      </div>
                      {t.themes.length > 0 && <ThemeChips themes={t.themes} size="xs" />}
                      <WorkPriorityBadge priority={t.priority} />
                      <WorkStatusBadge status={t.status} />
                    </li>
                  ))}
              </ul>
            )}
          </DashCard>
        )}

        {/* Overlord tasks */}
        {showOverlord && (
          <DashCard>
            <SectionLabel
              right={
                <span className="text-tiny text-text-tertiary tabular-nums">
                  {overlordActive}
                </span>
              }
            >
              Overlord agent tasks
            </SectionLabel>
            {overlordRes.data.length === 0 ? (
              <p className="text-[12px] text-text-secondary py-2">
                Sync Overlord on the <Link href="/overlord" className="underline">Overlord page</Link> to see agent tasks here.
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--border-default)" }}>
                {overlordRes.data
                  .filter(
                    (t) =>
                      t.status === "todo" ||
                      t.status === "in_progress" ||
                      t.status === "in_review" ||
                      t.status === "blocked",
                  )
                  .slice(0, 50)
                  .map((t) => (
                    <li key={t.id} className="flex items-center gap-2 py-2">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/overlord/${encodeURIComponent(t.taskKey)}`}
                          className="text-[12.5px] text-text-primary hover:underline truncate block"
                        >
                          {t.title}
                        </Link>
                        <div className="text-tiny text-text-tertiary truncate font-mono">
                          {t.taskKey} · {t.sectionName}
                          {t.claimedByAgent && ` · ${t.claimedByAgent}`}
                        </div>
                      </div>
                      <OverlordPriorityBadge priority={t.priority} />
                      <OverlordStatusBadge status={t.status} />
                    </li>
                  ))}
              </ul>
            )}
          </DashCard>
        )}
      </main>
    </>
  );
}

function SourcePill({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-md px-2.5 py-1 text-[12px] font-medium bg-text-primary text-card"
          : "rounded-md px-2.5 py-1 text-[12px] text-text-secondary hover:bg-surface hover:text-text-primary"
      }
      style={
        active
          ? { background: "var(--text-primary)", color: "var(--bg-card)" }
          : {}
      }
    >
      {label}
      <span className="ml-1.5 text-tiny opacity-70 tabular-nums">{count}</span>
    </Link>
  );
}
