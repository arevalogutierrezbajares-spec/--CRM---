import { MetricsRow } from "../daily/metrics-row";
import { TasksCard } from "../daily/tasks-card";
import { ProjectsCard } from "../daily/projects-card";
import { AIAssistPanel } from "../daily/ai-assist-panel";
import { WeekCalendar } from "./week-calendar";
import { MeetingHeatmap } from "./meeting-heatmap";
import type {
  DashCounts,
  DashMeeting,
  DashProject,
  DashTask,
} from "@/db/queries/dashboard";

interface WeeklyViewProps {
  counts: DashCounts;
  tasks: DashTask[];
  meetings: DashMeeting[];
  projects: DashProject[];
  weekStart: Date;
}

export function WeeklyView({
  counts,
  tasks,
  meetings,
  projects,
  weekStart,
}: WeeklyViewProps) {
  return (
    <>
      <MetricsRow counts={counts} />
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
