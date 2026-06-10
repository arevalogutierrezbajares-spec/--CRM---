import { MetricsRow } from "../daily/metrics-row";
import { TasksCard } from "../daily/tasks-card";
import { ProjectsCard } from "../daily/projects-card";
import { AIAssistPanel } from "../daily/ai-assist-panel";
import { DynamicKpiStrip } from "../daily/dynamic-kpi-strip";
import { WeekCalendar } from "./week-calendar";
import { MeetingHeatmap } from "./meeting-heatmap";
import type {
  DashCounts,
  DashMeeting,
  DashProject,
  DashTask,
  HomeCommandMetric,
} from "@/db/queries/dashboard";

interface WeeklyViewProps {
  counts: DashCounts;
  tasks: DashTask[];
  meetings: DashMeeting[];
  projects: DashProject[];
  weekStart: Date;
  commandMetrics: HomeCommandMetric[];
  commandMetricsError?: string | null;
}

export function WeeklyView({
  counts,
  tasks,
  meetings,
  projects,
  weekStart,
  commandMetrics,
  commandMetricsError,
}: WeeklyViewProps) {
  return (
    <>
      <MetricsRow counts={counts} />
      <DynamicKpiStrip metrics={commandMetrics} error={commandMetricsError} />
      <WeekCalendar meetings={meetings} weekStart={weekStart} />
      <div className="grid gap-2.5 lg:grid-cols-[1fr_320px]">
        <TasksCard tasks={tasks} scope="week" />
        <MeetingHeatmap meetings={meetings} weekStart={weekStart} />
      </div>
      <AIAssistPanel scope="weekly" />
      <ProjectsCard projects={projects} />
    </>
  );
}
