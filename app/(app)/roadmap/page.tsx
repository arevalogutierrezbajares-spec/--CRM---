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
import { UnassignedLane } from "@/components/roadmap/unassigned-lane";
import { RoadmapBoard } from "@/components/roadmap/roadmap-board";
import type {
  TimelineGroup,
  TimelineItem,
} from "@/components/roadmap/roadmap-timeline";

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
        { initiatives: [], members: [], lobs: [] },
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

  // Group on-timeline initiatives into Line-of-Business swimlanes.
  const tlGroups: TimelineGroup[] = (() => {
    const map = new Map<string, TimelineGroup>();
    for (const i of onTimeline) {
      const key = i.lobId ?? "none";
      if (!map.has(key)) {
        map.set(key, {
          lobId: i.lobId ?? null,
          lobTitle: i.projectTitle ?? "Cross-venture",
          items: [],
        });
      }
      const item: TimelineItem = {
        id: i.id,
        title: i.title,
        subLabel: i.ownerName ?? null,
        startDate: i.startDate,
        targetEndDate: i.targetEndDate,
        healthColor: i.healthColor,
        taskCount: i.taskCount,
        taskDoneCount: i.taskDoneCount,
      };
      map.get(key)!.items.push(item);
    }
    return Array.from(map.values());
  })();

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
            title="Snapshot the plan, review what changed since the last version, and commit a new baseline"
            className="rounded-md px-3 py-1.5 text-[13px] font-medium text-white"
            style={{ background: "var(--blue-mid)" }}
          >
            Review &amp; commit plan
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

        {/* Timeline + plan with shared milestone selection (click a bar →
            deliverables expand inline + the plan filters to it). */}
        <RoadmapBoard
          timeline={{
            monthCount,
            months: tl.months.map((m) => ({ label: m.label })),
            windowStartMs: tl.start.getTime(),
            windowTotalMs: tl.totalMs,
            todayPct,
            groups: tlGroups,
            detailsById: Object.fromEntries(
              planDocRes.data.initiatives.map((i) => [i.id, i]),
            ),
          }}
          planData={planDocRes.data}
        />

        {/* Unassigned lane (FR-UNI-3/4) */}
        <UnassignedLane
          tasks={unassignedRes.data}
          initiatives={planDocRes.data.initiatives.map((i) => ({
            id: i.id,
            title: i.title,
          }))}
        />

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
