import Link from "next/link";
import { Filter } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { DbBanner } from "@/components/db-banner";
import { WorkNav } from "@/components/work/work-nav";
import {
  FilterBar,
  type FilterDimension,
} from "@/components/work/filter-bar";
import {
  WorkPriorityBadge,
  WorkStatusBadge,
  InitiativeStatusBadge,
} from "@/components/work/priority-badge";
import { ThemeChips } from "@/components/work/theme-chips";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import { safeRead } from "@/lib/db-status";
import {
  listInitiatives,
  listThemes,
  listWorkTasks,
  type WorkTask,
} from "@/db/queries/work";
import {
  listOverlordSections,
  listOverlordTasks,
  type OverlordTaskWithSection,
} from "@/db/queries/overlord";
import {
  OverlordPriorityBadge,
  OverlordStatusBadge,
} from "@/components/overlord/status-badge";
import { listProjects } from "@/db/queries/projects";

type SearchParams = Promise<{
  source?: string;
  theme?: string;
  venture?: string;
  priority?: string;
  status?: string;
  section?: string;
}>;

const ALLOWED_PRIORITY = ["now", "next", "later", "backlog"];
const ALLOWED_OL_PRIORITY = ["NOW", "NEXT", "LATER", "BACKLOG"];

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
  const source = sp.source ?? "all";

  const [tasksRes, initsRes, themesRes, projectsRes, sectionsRes, overlordRes] =
    await Promise.all([
      safeRead<WorkTask[]>(
        () =>
          listWorkTasks({
            workspaceId: user.workspaceId,
            projectId: sp.venture || undefined,
            themeId: sp.theme || undefined,
            priority: ALLOWED_PRIORITY.includes(sp.priority ?? "")
              ? (sp.priority as "now" | "next" | "later" | "backlog")
              : undefined,
            limit: 300,
          }),
        [],
      ),
      safeRead(() => listInitiatives({ workspaceId: user.workspaceId }), []),
      safeRead(() => listThemes(user.workspaceId), []),
      safeRead(
        () => listProjects({ workspaceId: user.workspaceId, status: "active" }),
        [],
      ),
      safeRead(() => listOverlordSections(user.workspaceId), []),
      safeRead<OverlordTaskWithSection[]>(
        () =>
          listOverlordTasks({
            workspaceId: user.workspaceId,
            sectionKey: sp.section,
            priority: ALLOWED_OL_PRIORITY.includes(
              sp.priority?.toUpperCase() ?? "",
            )
              ? sp.priority?.toUpperCase()
              : undefined,
            status: sp.status,
            limit: 300,
          }),
        [],
      ),
    ]);

  const crmTasks = sp.status
    ? tasksRes.data.filter((t) => t.status === sp.status)
    : tasksRes.data;

  const showCrm = source === "all" || source === "crm";
  const showOverlord = source === "all" || source === "overlord";

  const activeInitiatives = initsRes.data.filter((i) => i.status === "active");

  const crmOpenCount = tasksRes.data.filter(
    (t) => t.status !== "done" && t.status !== "cancelled",
  ).length;
  const overlordActiveCount = overlordRes.data.filter(
    (t) =>
      t.status === "todo" ||
      t.status === "in_progress" ||
      t.status === "in_review" ||
      t.status === "blocked",
  ).length;

  // Build filter dimensions
  const themeCounts = new Map<string, number>();
  const ventureCounts = new Map<string, number>();
  const priorityCounts = new Map<string, number>();
  for (const t of tasksRes.data) {
    if (t.priority)
      priorityCounts.set(t.priority, (priorityCounts.get(t.priority) ?? 0) + 1);
    if (t.projectId)
      ventureCounts.set(t.projectId, (ventureCounts.get(t.projectId) ?? 0) + 1);
    for (const th of t.themes) {
      themeCounts.set(th.id, (themeCounts.get(th.id) ?? 0) + 1);
    }
  }

  const dimensions: FilterDimension[] = [
    {
      key: "theme",
      label: "Theme",
      options: themesRes.data
        .map((t) => ({
          value: t.id,
          label: t.name,
          color: t.color,
          count: themeCounts.get(t.id) ?? 0,
        }))
        .filter((o) => (o.count ?? 0) > 0),
    },
    {
      key: "venture",
      label: "Venture",
      options: projectsRes.data
        .map((p) => ({
          value: p.id,
          label: p.title,
          count: ventureCounts.get(p.id) ?? 0,
        }))
        .filter((o) => (o.count ?? 0) > 0),
    },
    {
      key: "priority",
      label: "Priority",
      options: ALLOWED_PRIORITY.map((p) => ({
        value: p,
        label: p,
        count: priorityCounts.get(p) ?? 0,
      })).filter((o) => (o.count ?? 0) > 0),
    },
  ];

  if (showOverlord && !showCrm) {
    dimensions.push({
      key: "section",
      label: "Section",
      options: sectionsRes.data.map((s) => ({
        value: s.sectionKey,
        label: s.name,
      })),
    });
  }

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 space-y-4">
        <header>
          <h1 className="text-[22px] font-medium tracking-tight">Work</h1>
          <p className="text-[13px] text-text-secondary">
            All open work across CRM milestones + Overlord agent tasks. Filter by theme to slice biz-dev vs tech vs ops.
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
          <SourcePill
            href={pathWith(sp, "source", null)}
            label="All"
            count={crmOpenCount + overlordActiveCount}
            active={source === "all"}
          />
          <SourcePill
            href={pathWith(sp, "source", "crm")}
            label="CRM"
            count={crmOpenCount}
            active={source === "crm"}
          />
          <SourcePill
            href={pathWith(sp, "source", "overlord")}
            label="Overlord"
            count={overlordActiveCount}
            active={source === "overlord"}
          />
        </div>

        {/* Rich filter bar */}
        {dimensions.some((d) => d.options.length > 0) && (
          <DashCard>
            <SectionLabel icon={Filter}>Filter</SectionLabel>
            <FilterBar dimensions={dimensions} />
          </DashCard>
        )}

        {/* Active initiatives summary */}
        {activeInitiatives.length > 0 &&
          showCrm &&
          !sp.theme &&
          !sp.venture && (
            <DashCard>
              <SectionLabel>Active initiatives</SectionLabel>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {activeInitiatives.map((init) => {
                  const c = init.themes[0]?.color ?? "var(--border-default)";
                  return (
                    <Link
                      key={init.id}
                      href={`/initiatives/${init.id}`}
                      className="rounded-md border bg-card p-2.5 hover:bg-surface transition-colors border-l-[3px]"
                      style={{
                        borderColor: "var(--border-default)",
                        borderLeftColor: c,
                      }}
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
                      {init.themes.length > 0 && (
                        <div className="mt-1.5">
                          <ThemeChips themes={init.themes} size="xs" />
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </DashCard>
          )}

        {/* CRM tasks */}
        {showCrm && (
          <DashCard>
            <SectionLabel
              right={
                <span className="text-tiny text-text-tertiary tabular-nums">
                  {crmTasks.filter((t) => t.status !== "done" && t.status !== "cancelled").length}
                </span>
              }
            >
              CRM milestones
            </SectionLabel>
            {crmTasks.length === 0 ? (
              <p className="text-[12px] text-text-secondary py-2">
                {tasksRes.data.length === 0
                  ? "No CRM tasks yet. Create milestones on projects."
                  : "No tasks match these filters."}
              </p>
            ) : (
              <ul
                className="divide-y"
                style={{ borderColor: "var(--border-default)" }}
              >
                {crmTasks
                  .filter((t) => t.status !== "done" && t.status !== "cancelled")
                  .slice(0, 100)
                  .map((t) => (
                    <li key={t.id} className="flex items-center gap-2 py-2">
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
                      {t.themes.length > 0 && (
                        <ThemeChips themes={t.themes} size="xs" />
                      )}
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
                  {overlordActiveCount}
                </span>
              }
            >
              Overlord agent tasks
            </SectionLabel>
            {overlordRes.data.length === 0 ? (
              <p className="text-[12px] text-text-secondary py-2">
                Sync Overlord on the{" "}
                <Link href="/overlord" className="underline">
                  Overlord page
                </Link>{" "}
                to see agent tasks here.
              </p>
            ) : (
              <ul
                className="divide-y"
                style={{ borderColor: "var(--border-default)" }}
              >
                {overlordRes.data
                  .filter(
                    (t) =>
                      t.status === "todo" ||
                      t.status === "in_progress" ||
                      t.status === "in_review" ||
                      t.status === "blocked",
                  )
                  .slice(0, 100)
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

function pathWith(
  sp: {
    source?: string;
    theme?: string;
    venture?: string;
    priority?: string;
    status?: string;
    section?: string;
  },
  key: string,
  value: string | null,
): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v && k !== key) next.set(k, String(v));
  }
  if (value !== null) next.set(key, value);
  const q = next.toString();
  return q ? `/work?${q}` : "/work";
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
          ? "rounded-md px-2.5 py-1 text-[12px] font-medium"
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
