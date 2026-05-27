import { MetricsRow } from "./metrics-row";
import { TasksCard } from "./tasks-card";
import { MeetingsCard } from "./meetings-card";
import { ProjectsCard } from "./projects-card";
import { AIAssistPanel } from "./ai-assist-panel";
import type {
  DashCounts,
  DashMeeting,
  DashProject,
  DashTask,
} from "@/db/queries/dashboard";

interface DailyViewProps {
  counts: DashCounts;
  tasks: DashTask[];
  meetings: DashMeeting[];
  projects: DashProject[];
}

export function DailyView({
  counts,
  tasks,
  meetings,
  projects,
}: DailyViewProps) {
  return (
    <>
      <MetricsRow counts={counts} />
      <div className="grid gap-2.5 lg:grid-cols-2">
        <TasksCard tasks={tasks} scope="today" />
        <MeetingsCard meetings={meetings} scope="today" />
      </div>
      <AIAssistPanel scope="daily" />
      <ProjectsCard projects={projects} />
    </>
  );
}
