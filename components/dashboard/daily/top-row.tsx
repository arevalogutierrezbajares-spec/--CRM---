import { MetricCard } from "../shared/metric-card";
import { CountdownCard } from "./countdown-card";
import { MeetingsAgenda } from "./meetings-agenda";
import { TasksDueAgenda } from "./tasks-due-agenda";
import type { DashMeeting, DashTask } from "@/db/queries/dashboard";
import type { WorkspaceCountdown } from "@/db/queries/workspace-settings";

/** Top row: ordered meetings agenda · upcoming tasks-due agenda · countdown to the milestone. */
export function TopRow({
  meetings,
  tasks,
  countdown,
  nowMs,
  tz,
}: {
  meetings: DashMeeting[];
  tasks: DashTask[];
  countdown: WorkspaceCountdown | null;
  nowMs: number;
  tz: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      <MeetingsAgenda meetings={meetings} nowMs={nowMs} tz={tz} />
      <TasksDueAgenda tasks={tasks} tz={tz} />
      {countdown && countdown.date ? (
        <CountdownCard targetDate={countdown.date} title={countdown.title} subpoints={countdown.subpoints} nowMs={nowMs} />
      ) : (
        <MetricCard value="—" label="Set a milestone" delta="Configure in settings" href="/workspace" />
      )}
    </div>
  );
}
