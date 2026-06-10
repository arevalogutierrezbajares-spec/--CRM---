import Link from "next/link";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { DbBanner } from "@/components/db-banner";
import { WorkNav } from "@/components/work/work-nav";
import { InitiativeStatusBadge } from "@/components/work/priority-badge";
import { ThemeChips } from "@/components/work/theme-chips";
import { safeRead } from "@/lib/db-status";
import {
  listInitiatives,
  listSprints,
  type InitiativeListItem,
  type SprintWithStats,
} from "@/db/queries/work";
import {
  getPlanDocData,
  listUnassignedTasks,
  nextPlanVersionNumber,
  type PlanDocData,
} from "@/db/queries/roadmap";
import { RoadmapToolbar } from "@/components/roadmap/roadmap-toolbar";
import { PlanDoc } from "@/components/roadmap/plan-doc";
import { UnassignedLane } from "@/components/roadmap/unassigned-lane";

/* FR-RVW-3: exactly three zoom levels. */
const WINDOWS = {
  quarter: { months: 3, label: "Quarter" },
  "6mo": { months: 6, label: "6 months" },
  year: { months: 12, label: "Year" },
} as const;
type WindowKey = keyof typeof WINDOWS;

function buildTimeline(monthCount: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + monthCount, 0);
  const months: Array<{ label: string; startMs: number; endMs: number }> = [];
  for (let i = 0; i < monthCount; i++) {
    const ms = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const me = new Date(start.getFullYear(), start.getMonth() + i + 1, 0, 23, 59, 59);
    months.push({
      label: ms.toLocaleDateString(undefined, {
        month: "short",
        year: "2-digit",
      }),
      startMs: ms.getTime(),
      endMs: me.getTime(),
    });
  }
  return { start, end, months, totalMs: end.getTime() - start.getTime() };
}

function leftPct(dateIso: string | null, start: Date, totalMs: number): number {
  if (!dateIso) return 0;
  const d = new Date(dateIso).getTime();
  const pos = ((d - start.getTime()) / totalMs) * 100;
  return Math.max(0, Math.min(100, pos));
}

function widthPct(
  startIso: string | null,
  endIso: string | null,
  windowStart: Date,
  totalMs: number,
): number {
  if (!startIso || !endIso) return 0;
  const a = leftPct(startIso, windowStart, totalMs);
  const b = leftPct(endIso, windowStart, totalMs);
  return Math.max(2, b - a);
}

export default async function RoadmapPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const windowKey: WindowKey =
    sp.window === "quarter" || sp.window === "year" ? sp.window : "6mo";
  const monthCount = WINDOWS[windowKey].months;

  const [initsRes, sprintsRes, planDocRes, unassignedRes, versionRes] =
    await Promise.all([
      safeRead<InitiativeListItem[]>(
        () => listInitiatives({ workspaceId: user.workspaceId }),
        [],
      ),
      safeRead<SprintWithStats[]>(() => listSprints(user.workspaceId), []),
      safeRead<PlanDocData>(
        () => getPlanDocData(user.workspaceId),
        { initiatives: [], members: [] },
      ),
      safeRead(
        () => listUnassignedTasks(user.workspaceId),
        [] as Awaited<ReturnType<typeof listUnassignedTasks>>,
      ),
      safeRead<number>(() => nextPlanVersionNumber(user.workspaceId), 1),
    ]);
  const currentVersion = versionRes.data - 1;

  const tl = buildTimeline(monthCount);

  // Only show initiatives with at least a start_date that overlaps the window
  const onTimeline = initsRes.data.filter((i) => {
    if (!i.startDate) return false;
    if (i.status === "cancelled") return false;
    const s = new Date(i.startDate).getTime();
    const e = i.targetEndDate
      ? new Date(i.targetEndDate).getTime()
      : Math.max(s, tl.end.getTime());
    return e >= tl.start.getTime() && s <= tl.end.getTime();
  });

  const offTimeline = initsRes.data.filter(
    (i) => !i.startDate && i.status !== "cancelled",
  );
  const todayPct = leftPct(
    new Date().toISOString().slice(0, 10),
    tl.start,
    tl.totalMs,
  );

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 space-y-4">
        <header className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[22px] font-medium tracking-tight">Roadmap</h1>
            <p className="text-[13px] text-text-secondary">
              The plan, end to end — edit anything in place.
            </p>
          </div>
          <Link
            href="/roadmap/plan"
            className="rounded-md px-3 py-1.5 text-[13px] font-medium text-white"
            style={{ background: "var(--blue-mid)" }}
          >
            Planning session
          </Link>
        </header>

        <WorkNav />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <RoadmapToolbar currentVersion={currentVersion} />
          {/* FR-RVW-3: three zoom levels only */}
          <div
            className="flex items-center rounded-md border overflow-hidden"
            style={{ borderColor: "var(--border-default)" }}
          >
            {(Object.keys(WINDOWS) as WindowKey[]).map((k) => (
              <Link
                key={k}
                href={`/roadmap?window=${k}`}
                className={`px-2.5 py-1 text-[12px] ${
                  k === windowKey
                    ? "font-medium text-text-primary bg-surface"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {WINDOWS[k].label}
              </Link>
            ))}
          </div>
        </div>

        {!initsRes.ok && (
          <DbBanner error={(initsRes as { error?: string }).error ?? ""} />
        )}

        {/* Timeline grid */}
        <div
          className="rounded-lg border bg-card p-3 overflow-x-auto"
          style={{ borderColor: "var(--border-default)" }}
        >
          <div className="min-w-[700px] relative">
            {/* Month header */}
            <div
              className="grid border-b pb-1.5 mb-2"
              style={{
                gridTemplateColumns: `200px repeat(${monthCount}, 1fr)`,
                borderColor: "var(--border-default)",
              }}
            >
              <div className="text-tiny text-text-tertiary font-medium uppercase tracking-wider">
                Initiative
              </div>
              {tl.months.map((m) => (
                <div
                  key={m.label}
                  className="text-tiny text-text-secondary font-medium text-center"
                >
                  {m.label}
                </div>
              ))}
            </div>

            {/* Today marker on the data area */}
            {todayPct > 0 && (
              <div
                className="absolute top-8 bottom-0 border-l-2 border-dashed pointer-events-none"
                style={{
                  left: `calc(200px + ${todayPct}% * (100% - 200px) / 100%)`,
                  borderColor: "var(--blue-mid)",
                }}
              />
            )}

            {onTimeline.length === 0 ? (
              <p className="text-[12px] text-text-secondary py-4 text-center">
                No initiatives with start dates in this window. Set dates in the
                plan below and they appear here.
              </p>
            ) : (
              onTimeline.map((init) => {
                const left = leftPct(init.startDate, tl.start, tl.totalMs);
                const width = widthPct(
                  init.startDate,
                  init.targetEndDate ?? new Date(tl.end).toISOString().slice(0, 10),
                  tl.start,
                  tl.totalMs,
                );
                const fillColor =
                  init.healthColor === "red"
                    ? "var(--red-mid)"
                    : init.healthColor === "amber"
                      ? "var(--amber-mid)"
                      : "var(--green-mid)";

                return (
                  <div
                    key={init.id}
                    className="grid items-center py-1.5"
                    style={{ gridTemplateColumns: `200px 1fr` }}
                  >
                    <Link
                      href={`/initiatives/${init.id}`}
                      className="min-w-0 pr-2"
                    >
                      <div className="text-[12.5px] font-medium text-text-primary truncate hover:underline">
                        {init.title}
                      </div>
                      <div className="text-tiny text-text-tertiary truncate">
                        {init.projectTitle ?? "Cross-venture"}
                      </div>
                    </Link>
                    <div className="relative h-7 bg-surface rounded">
                      <div
                        className="absolute top-1 bottom-1 rounded flex items-center px-2 text-tiny font-medium text-white"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          background: `color-mix(in oklab, ${fillColor} 75%, transparent)`,
                        }}
                        title={`${init.startDate} → ${init.targetEndDate ?? "open"}`}
                      >
                        {/* FR-PRG-1: fractions, not percentages */}
                        <span className="truncate" style={{ color: "white" }}>
                          {init.taskCount > 0
                            ? `${init.taskDoneCount}/${init.taskCount}`
                            : "no tasks"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Unassigned lane (FR-UNI-3/4) */}
        <UnassignedLane
          tasks={unassignedRes.data}
          initiatives={planDocRes.data.initiatives.map((i) => ({
            id: i.id,
            title: i.title,
          }))}
        />

        {/* The plan as a document (FR-RVW-1) */}
        <section className="space-y-2">
          <h2 className="text-label text-text-secondary">The plan</h2>
          <PlanDoc data={planDocRes.data} />
        </section>

        {/* Sprints list */}
        {sprintsRes.data.length > 0 && (
          <div
            className="rounded-lg border bg-card p-3"
            style={{ borderColor: "var(--border-default)" }}
          >
            <h2 className="text-label text-text-secondary mb-3">Sprints</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sprintsRes.data.map((s) => (
                <div
                  key={s.id}
                  className="rounded-md border bg-surface p-2.5"
                  style={{ borderColor: "var(--border-default)" }}
                >
                  <div className="text-[12.5px] font-medium text-text-primary">
                    {s.name}
                  </div>
                  <div className="text-tiny text-text-tertiary tabular-nums mt-1">
                    {new Date(s.startDate).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    →{" "}
                    {new Date(s.endDate).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    · {s.taskDoneCount}/{s.taskCount}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Off-timeline initiatives */}
        {offTimeline.length > 0 && (
          <div
            className="rounded-lg border bg-card p-3"
            style={{ borderColor: "var(--border-default)" }}
          >
            <h2 className="text-label text-text-secondary mb-3">
              Without dates ({offTimeline.length})
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {offTimeline.map((init) => (
                <Link
                  key={init.id}
                  href={`/initiatives/${init.id}`}
                  className="rounded-md border bg-surface p-2 hover:bg-card"
                  style={{ borderColor: "var(--border-default)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[12.5px] text-text-primary line-clamp-1">
                      {init.title}
                    </span>
                    <InitiativeStatusBadge status={init.status} />
                  </div>
                  {init.themes.length > 0 && (
                    <div className="mt-1.5">
                      <ThemeChips themes={init.themes} size="xs" />
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
