import Link from "next/link";
import { Plus, Target } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { DbBanner } from "@/components/db-banner";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import { ProgressBar } from "@/components/dashboard/shared/progress-bar";
import { WorkNav } from "@/components/work/work-nav";
import { SprintColumn } from "@/components/work/sprint-column";
import { SprintStatusBadge } from "@/components/work/priority-badge";
import { safeRead } from "@/lib/db-status";
import {
  getActiveSprint,
  listSprints,
  listWorkTasks,
  type SprintWithStats,
  type WorkTask,
} from "@/db/queries/work";
import {
  createSprint,
  setSprintStatus,
} from "@/app/(app)/work/actions";

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default async function SprintPage() {
  const user = await requireUser();
  const [activeRes, allRes] = await Promise.all([
    safeRead<SprintWithStats | null>(
      () => getActiveSprint(user.workspaceId),
      null,
    ),
    safeRead<SprintWithStats[]>(() => listSprints(user.workspaceId), []),
  ]);

  const active = activeRes.data;
  const tasksRes = active
    ? await safeRead<WorkTask[]>(
        () =>
          listWorkTasks({
            workspaceId: user.workspaceId,
            sprintId: active.id,
            limit: 200,
          }),
        [],
      )
    : { ok: true as const, data: [] as WorkTask[] };

  const byStatus: Record<string, WorkTask[]> = {
    pending: [],
    in_progress: [],
    in_review: [],
    done: [],
  };
  for (const t of tasksRes.data) {
    const key =
      t.status === "blocked"
        ? "in_progress"
        : t.status === "cancelled"
          ? "done"
          : t.status;
    if (byStatus[key]) byStatus[key].push(t);
    else byStatus.pending.push(t);
  }

  const otherSprints = allRes.data.filter((s) => s.id !== active?.id);

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 space-y-4">
        <header>
          <h1 className="text-[22px] font-medium tracking-tight">Work</h1>
          <p className="text-[13px] text-text-secondary">
            Current sprint kanban. Click → on a card to move it forward.
          </p>
        </header>

        <WorkNav />

        {!activeRes.ok && (
          <DbBanner error={(activeRes as { error?: string }).error ?? ""} />
        )}

        {/* Active sprint header */}
        {active ? (
          <DashCard>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <SectionLabel icon={Target} className="mb-0">
                    Active sprint
                  </SectionLabel>
                  <SprintStatusBadge status={active.status} />
                </div>
                <h2 className="text-[16px] font-medium text-text-primary mt-1">
                  {active.name}
                </h2>
                {active.goal && (
                  <p className="text-[12px] text-text-secondary mt-0.5">
                    {active.goal}
                  </p>
                )}
                <p className="text-tiny text-text-tertiary mt-1.5 tabular-nums">
                  {shortDate(active.startDate)} → {shortDate(active.endDate)} ·
                  {" "}
                  {active.taskDoneCount}/{active.taskCount} done
                </p>
              </div>
              <form
                action={async () => {
                  "use server";
                  await setSprintStatus(active.id, "completed");
                }}
              >
                <Button type="submit" size="sm" variant="outline">
                  Complete sprint
                </Button>
              </form>
            </div>
            <ProgressBar pct={active.progressPct} className="mt-3" />
          </DashCard>
        ) : (
          <div
            className="rounded-lg border bg-card p-4"
            style={{ borderColor: "var(--border-default)" }}
          >
            <h2 className="text-[13px] font-medium text-text-primary">
              No active sprint
            </h2>
            <p className="text-[12px] text-text-secondary mt-1">
              Start one to focus this week's tasks.
            </p>
            <form action={createSprint} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 items-end">
              <label className="block space-y-1">
                <span className="text-tiny text-text-secondary font-medium">Name</span>
                <input
                  name="name"
                  required
                  placeholder="Sprint 1"
                  className="w-full rounded-md border bg-card px-3 py-1.5 text-[13px]"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-tiny text-text-secondary font-medium">Start</span>
                <input
                  name="startDate"
                  type="date"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="w-full rounded-md border bg-card px-3 py-1.5 text-[13px]"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-tiny text-text-secondary font-medium">End</span>
                <input
                  name="endDate"
                  type="date"
                  required
                  defaultValue={new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)}
                  className="w-full rounded-md border bg-card px-3 py-1.5 text-[13px]"
                />
              </label>
              <Button type="submit" size="sm">
                Create
              </Button>
              <label className="block space-y-1 col-span-2 sm:col-span-4">
                <span className="text-tiny text-text-secondary font-medium">Goal (optional)</span>
                <input
                  name="goal"
                  placeholder="What this sprint will ship"
                  className="w-full rounded-md border bg-card px-3 py-1.5 text-[13px]"
                />
              </label>
            </form>
          </div>
        )}

        {/* Kanban */}
        {active && (
          <div className="grid gap-2.5 grid-cols-1 lg:grid-cols-2 xl:grid-cols-4">
            <SprintColumn
              status="pending"
              label="Todo"
              tasks={byStatus.pending}
            />
            <SprintColumn
              status="in_progress"
              label="In progress"
              tasks={byStatus.in_progress}
            />
            <SprintColumn
              status="in_review"
              label="In review"
              tasks={byStatus.in_review}
            />
            <SprintColumn status="done" label="Done" tasks={byStatus.done} />
          </div>
        )}

        {/* Other sprints */}
        {otherSprints.length > 0 && (
          <DashCard>
            <SectionLabel>Other sprints</SectionLabel>
            <ul className="space-y-1.5">
              {otherSprints.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded px-1 py-1 hover:bg-surface"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] text-text-primary truncate">
                      {s.name}
                    </div>
                    <div className="text-tiny text-text-tertiary">
                      {shortDate(s.startDate)} → {shortDate(s.endDate)} · {s.taskDoneCount}/{s.taskCount}
                    </div>
                  </div>
                  <SprintStatusBadge status={s.status} />
                  {s.status === "planned" && (
                    <form
                      action={async () => {
                        "use server";
                        await setSprintStatus(s.id, "active");
                      }}
                    >
                      <button
                        type="submit"
                        className="text-tiny text-blue-text hover:underline"
                      >
                        Activate
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </DashCard>
        )}
      </main>
    </>
  );
}
