import Link from "next/link";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { DbBanner } from "@/components/db-banner";
import { WorkNav } from "@/components/work/work-nav";
import { StrategySpine } from "@/components/work/strategy-spine";
import { InitiativeStatusBadge } from "@/components/work/priority-badge";
import { ThemeChips } from "@/components/work/theme-chips";
import { safeRead } from "@/lib/db-status";
import {
  listInitiatives,
  listSprints,
  type InitiativeListItem,
  type SprintWithStats,
} from "@/db/queries/work";

/* Compute a 6-month timeline window starting from today's month. */
function buildTimeline() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 6, 0);
  const months: Array<{ label: string; startMs: number; endMs: number }> = [];
  for (let i = 0; i < 6; i++) {
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

export default async function RoadmapPage() {
  const user = await requireUser();
  const [initsRes, sprintsRes] = await Promise.all([
    safeRead<InitiativeListItem[]>(
      () => listInitiatives({ workspaceId: user.workspaceId }),
      [],
    ),
    safeRead<SprintWithStats[]>(() => listSprints(user.workspaceId), []),
  ]);

  const tl = buildTimeline();

  // Only show initiatives with at least a start_date that overlaps the window
  const onTimeline = initsRes.data.filter((i) => {
    if (!i.startDate) return false;
    const s = new Date(i.startDate).getTime();
    const e = i.targetEndDate
      ? new Date(i.targetEndDate).getTime()
      : Math.max(s, tl.end.getTime());
    return e >= tl.start.getTime() && s <= tl.end.getTime();
  });

  const offTimeline = initsRes.data.filter((i) => !i.startDate);
  const todayPct = leftPct(
    new Date().toISOString().slice(0, 10),
    tl.start,
    tl.totalMs,
  );

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 space-y-4">
        <header>
          <h1 className="text-[22px] font-medium tracking-tight">Roadmap</h1>
          <p className="text-[13px] text-text-secondary">
            6-month roadmap of initiatives and sprints.
          </p>
        </header>

        <WorkNav />

        <StrategySpine
          active="roadmap"
          initiativeCount={initsRes.data.length}
          sprintCount={sprintsRes.data.length}
        />

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
                gridTemplateColumns: `200px repeat(6, 1fr)`,
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
                No initiatives with start dates in the next 6 months. Add start dates on the initiative form.
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
                        <span className="truncate" style={{ color: "white" }}>
                          {init.progressPct}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

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
