import { MetricCard } from "../shared/metric-card";
import { CountdownCard } from "./countdown-card";
import type { DashCounts } from "@/db/queries/dashboard";
import type { WorkspaceCountdown } from "@/db/queries/workspace-settings";

/** The 3-up top row: Meetings today · Tasks due · live countdown to the big milestone. */
export function TopRow({
  counts,
  countdown,
  nowMs,
}: {
  counts: DashCounts;
  countdown: WorkspaceCountdown | null;
  nowMs: number;
}) {
  const tasksDelta =
    counts.tasksTodayOverdue > 0
      ? `${counts.tasksTodayOverdue} overdue`
      : counts.tasksToday > 0
        ? "on track"
        : "nothing due";
  const tasksTone: "neutral" | "bad" = counts.tasksTodayOverdue > 0 ? "bad" : "neutral";

  const meetingsDelta =
    counts.nextMeetingMinutes !== null
      ? counts.nextMeetingMinutes < 60
        ? `Next in ${counts.nextMeetingMinutes}m`
        : `Next in ${Math.round(counts.nextMeetingMinutes / 60)}h`
      : counts.meetingsToday > 0
        ? "all wrapped"
        : "none today";

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      <MetricCard value={counts.meetingsToday} label="Meetings today" delta={meetingsDelta} href="/meetings" />
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
