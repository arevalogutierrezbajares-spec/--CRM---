import { MetricsRow } from "./metrics-row";
import { TasksCard } from "./tasks-card";
import { MeetingsCard } from "./meetings-card";
import { ProjectsCard } from "./projects-card";
import { ActionItemsCard } from "./action-items-card";
import { AIAssistPanel } from "./ai-assist-panel";
import type {
  DashActionItem,
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
  actionItems: DashActionItem[];
}

export function DailyView({
  counts,
  tasks,
  meetings,
  projects,
  actionItems,
}: DailyViewProps) {
  return (
    <>
      <MetricsRow counts={counts} />
      <div className="grid gap-2.5 lg:grid-cols-2">
        <ActionItemsCard items={actionItems} />
        <TasksCard tasks={tasks} scope="today" />
      </div>
      <div className="grid gap-2.5 lg:grid-cols-2">
        <MeetingsCard meetings={meetings} scope="today" />
        <ProjectsCard projects={projects} />
      </div>
      <AIAssistPanel scope="daily" />
    </>
  );
}
