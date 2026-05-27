import { MetricCard } from "../shared/metric-card";
import type { DashCounts } from "@/db/queries/dashboard";

interface MetricsRowProps {
  counts: DashCounts;
}

export function MetricsRow({ counts }: MetricsRowProps) {
  const tasksDelta =
    counts.tasksTodayOverdue > 0
      ? `${counts.tasksTodayOverdue} overdue`
      : counts.tasksToday > 0
        ? "on track"
        : "nothing due";
  const tasksDeltaTone = counts.tasksTodayOverdue > 0 ? "bad" : "neutral";

  const meetingsDelta =
    counts.nextMeetingMinutes !== null
      ? counts.nextMeetingMinutes < 60
        ? `Next in ${counts.nextMeetingMinutes}m`
        : `Next in ${Math.round(counts.nextMeetingMinutes / 60)}h`
      : counts.meetingsToday > 0
        ? "all wrapped"
        : "none scheduled";
  const meetingsDeltaTone: "neutral" | "warn" =
    counts.nextMeetingMinutes !== null && counts.nextMeetingMinutes < 30
      ? "warn"
      : "neutral";

  const projectsDelta =
    counts.nearestProjectDueDays !== null
      ? counts.nearestProjectDueDays === 0
        ? "due today"
        : `next due in ${counts.nearestProjectDueDays}d`
      : "no deadlines";
  const projectsDeltaTone =
    counts.nearestProjectDueDays !== null && counts.nearestProjectDueDays <= 2
      ? "warn"
      : "neutral";

  return (
    <div className="grid gap-2.5 grid-cols-2 lg:grid-cols-4">
      <MetricCard
        value={counts.tasksToday}
        label="Tasks today"
        delta={tasksDelta}
        deltaTone={tasksDeltaTone as "bad" | "neutral"}
      />
      <MetricCard
        value={counts.meetingsToday}
        label="Meetings today"
        delta={meetingsDelta}
        deltaTone={meetingsDeltaTone}
      />
      <MetricCard
        value={counts.blockedProjects}
        label="Blocked"
        delta={
          counts.blockedProjects === 0
            ? "all moving"
            : `${counts.blockedProjects} waiting`
        }
        deltaTone={counts.blockedProjects > 0 ? "warn" : "good"}
      />
      <MetricCard
        value={counts.activeProjects}
        label="Active projects"
        delta={projectsDelta}
        deltaTone={projectsDeltaTone}
      />
    </div>
  );
}
