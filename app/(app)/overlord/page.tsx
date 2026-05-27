import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { DbBanner } from "@/components/db-banner";
import { SyncButton } from "@/components/overlord/sync-button";
import { SectionNav } from "@/components/overlord/section-nav";
import { OverlordTaskCard } from "@/components/overlord/task-card";
import { ActivityFeed } from "@/components/overlord/activity-feed";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import { Activity, Users, AlertCircle } from "lucide-react";
import { safeRead } from "@/lib/db-status";
import {
  listOverlordActivity,
  listOverlordTasks,
  overlordCounts,
  type OverlordCounts,
} from "@/db/queries/overlord";

type SearchParams = Promise<{
  section?: string;
  status?: string;
  priority?: string;
  agent?: string;
}>;

const EMPTY_COUNTS: OverlordCounts = {
  total: 0,
  byStatus: {},
  byPriority: {},
  bySection: [],
  bySectionId: new Map(),
  activeAgents: [],
  lastSync: null,
};

const STATUS_COLUMNS = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "in_review", label: "In review" },
  { key: "blocked", label: "Blocked" },
] as const;

export default async function OverlordPage(props: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const sp = await props.searchParams;

  const [countsRes, tasksRes, activityRes] = await Promise.all([
    safeRead<OverlordCounts>(() => overlordCounts(user.workspaceId), EMPTY_COUNTS),
    safeRead(
      () =>
        listOverlordTasks({
          workspaceId: user.workspaceId,
          sectionKey: sp.section,
          status: sp.status,
          priority: sp.priority,
          agent: sp.agent,
          limit: 300,
        }),
      [],
    ),
    safeRead(() => listOverlordActivity(user.workspaceId, 25), []),
  ]);

  const counts = countsRes.data;
  const tasks = tasksRes.data;
  const tasksByStatus = new Map<string, typeof tasks>();
  for (const col of STATUS_COLUMNS) tasksByStatus.set(col.key, []);
  for (const t of tasks) {
    if (tasksByStatus.has(t.status)) tasksByStatus.get(t.status)!.push(t);
  }

  const totalActive =
    (counts.byStatus.todo ?? 0) +
    (counts.byStatus.in_progress ?? 0) +
    (counts.byStatus.in_review ?? 0) +
    (counts.byStatus.blocked ?? 0);

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 space-y-4">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[22px] font-medium tracking-tight">Overlord</h1>
            <p className="text-[13px] text-text-secondary">
              Read-only mirror of TOURISM agent task board · {counts.total} tasks across {counts.bySection.length} sections
            </p>
          </div>
          <SyncButton
            lastSyncIso={counts.lastSync ? counts.lastSync.toISOString() : null}
          />
        </header>

        {!countsRes.ok && (
          <DbBanner
            error={(countsRes as { error?: string }).error ?? "Database error"}
          />
        )}

        {counts.total === 0 ? (
          <div
            className="rounded-lg border bg-card p-6 text-center"
            style={{ borderColor: "var(--border-default)" }}
          >
            <p className="text-[13px] text-text-secondary">
              No Overlord tasks ingested yet.
              {" "}
              <span className="text-text-primary font-medium">
                Click "Sync now" above
              </span>{" "}
              to pull the latest TASKS.md files from the TOURISM repo.
            </p>
            <p className="text-tiny text-text-tertiary mt-2">
              Reading from <code>/Users/tomas/--TOURISM--/005- WIKI/operation-overlord/section-*/TASKS.md</code>
            </p>
          </div>
        ) : (
          <>
            {/* Top stats row */}
            <div className="grid gap-2.5 lg:grid-cols-3">
              <DashCard>
                <SectionLabel icon={AlertCircle}>By priority</SectionLabel>
                <div className="space-y-1.5">
                  {(["NOW", "NEXT", "LATER", "BACKLOG"] as const).map((p) => {
                    const c = counts.byPriority[p] ?? 0;
                    if (c === 0) return null;
                    return (
                      <div
                        key={p}
                        className="flex justify-between text-[12.5px]"
                      >
                        <span className="text-text-secondary">{p}</span>
                        <span className="font-medium tabular-nums text-text-primary">
                          {c}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </DashCard>

              <DashCard>
                <SectionLabel icon={Users}>Active agents</SectionLabel>
                {counts.activeAgents.length === 0 ? (
                  <p className="text-[12px] text-text-secondary">
                    No agents currently claimed.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {counts.activeAgents.slice(0, 6).map((a) => (
                      <li
                        key={a.agent}
                        className="flex justify-between text-[12.5px]"
                      >
                        <span className="text-text-primary font-mono">
                          {a.agent}
                        </span>
                        <span className="text-text-tertiary tabular-nums">
                          {a.count} task{a.count === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </DashCard>

              <DashCard>
                <SectionLabel icon={Activity}>Workflow</SectionLabel>
                <div className="space-y-1.5">
                  {STATUS_COLUMNS.map((col) => (
                    <div
                      key={col.key}
                      className="flex justify-between text-[12.5px]"
                    >
                      <span className="text-text-secondary">{col.label}</span>
                      <span className="font-medium tabular-nums text-text-primary">
                        {counts.byStatus[col.key] ?? 0}
                      </span>
                    </div>
                  ))}
                  <div
                    className="flex justify-between text-[12.5px] border-t pt-1.5"
                    style={{ borderColor: "var(--border-default)" }}
                  >
                    <span className="text-text-secondary">Active</span>
                    <span className="font-medium tabular-nums text-text-primary">
                      {totalActive} / {counts.total}
                    </span>
                  </div>
                </div>
              </DashCard>
            </div>

            <SectionNav
              sections={counts.bySection}
              totalCount={counts.total}
              totalActive={totalActive}
            />

            {/* Kanban-by-status */}
            <div className="grid gap-2.5 grid-cols-1 lg:grid-cols-2 xl:grid-cols-4">
              {STATUS_COLUMNS.map((col) => {
                const colTasks = tasksByStatus.get(col.key) ?? [];
                return (
                  <section
                    key={col.key}
                    className="rounded-lg border bg-surface/30 p-2 space-y-2"
                    style={{ borderColor: "var(--border-default)" }}
                  >
                    <div className="flex items-center justify-between px-1">
                      <h3 className="text-label text-text-secondary">
                        {col.label}
                      </h3>
                      <span className="text-tiny text-text-tertiary tabular-nums">
                        {colTasks.length}
                      </span>
                    </div>
                    {colTasks.length === 0 ? (
                      <p className="text-tiny text-text-tertiary p-2">—</p>
                    ) : (
                      <div className="space-y-2 max-h-[800px] overflow-y-auto pr-1">
                        {colTasks.slice(0, 30).map((t) => (
                          <OverlordTaskCard key={t.id} task={t} />
                        ))}
                        {colTasks.length > 30 && (
                          <p className="text-tiny text-text-tertiary px-1">
                            +{colTasks.length - 30} more
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>

            {/* Activity timeline */}
            <DashCard>
              <SectionLabel icon={Activity}>Recent agent activity</SectionLabel>
              <ActivityFeed events={activityRes.data} />
            </DashCard>
          </>
        )}
      </main>
    </>
  );
}
