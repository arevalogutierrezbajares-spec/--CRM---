import { MetricCard } from "../shared/metric-card";
import { CountdownCard } from "./countdown-card";
import { MeetingsAgenda } from "./meetings-agenda";
import type { DashCounts, DashMeeting } from "@/db/queries/dashboard";
import type { WorkspaceCountdown } from "@/db/queries/workspace-settings";

/** The top row: ordered meetings agenda · tasks due · live countdown to the milestone. */
export function TopRow({
  counts,
  meetings,
  countdown,
  nowMs,
  tz,
}: {
  counts: DashCounts;
  meetings: DashMeeting[];
  countdown: WorkspaceCountdown | null;
  nowMs: number;
  tz: string;
}) {
  const tasksDelta =
    counts.tasksTodayOverdue > 0
      ? `${counts.tasksTodayOverdue} overdue`
      : counts.tasksToday > 0
        ? "on track"
        : "nothing due";
  const tasksTone: "neutral" | "bad" = counts.tasksTodayOverdue > 0 ? "bad" : "neutral";

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr]">
      <MeetingsAgenda meetings={meetings} nowMs={nowMs} tz={tz} />
      <MetricCard value={counts.tasksToday} label="Tasks due" delta={tasksDelta} deltaTone={tasksTone} href="/work" />
      {countdown && countdown.date ? (
        <CountdownCard
          targetDate={countdown.date}
          title={countdown.title}
          subpoints={countdown.subpoints}
          nowMs={nowMs}
        />
      ) : (
        <MetricCard value="—" label="Set a milestone" delta="Configure in settings" href="/workspace" />
      )}
    </div>
  );
}
