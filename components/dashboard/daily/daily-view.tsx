import { MetricsRow } from "./metrics-row";
import { TasksCard } from "./tasks-card";
import { MeetingsCard } from "./meetings-card";
import { ProjectsCard } from "./projects-card";
import { ActionItemsCard } from "./action-items-card";
import { AIAssistPanel } from "./ai-assist-panel";
import { ItemDrawerProvider } from "../item-drawer";
import { PinnedProjects } from "../pinned-projects";
import type { PinnedProject } from "@/db/queries/pins";
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
  pickerProjects: { id: string; title: string }[];
  members: { userId: string; displayName: string }[];
  pinnedProjects: PinnedProject[];
  initialItem?: { entityType: "action_item" | "milestone" | "meeting"; id: string } | null;
}

export function DailyView({
  counts,
  tasks,
  meetings,
  projects,
  actionItems,
  pickerProjects,
  members,
  pinnedProjects,
  initialItem,
}: DailyViewProps) {
  return (
    <ItemDrawerProvider
      // Remount when the ?item= deep-link changes so it opens the new item.
      key={initialItem ? `${initialItem.entityType}:${initialItem.id}` : "none"}
      projects={pickerProjects}
      members={members}
      initialItem={initialItem}
    >
      <MetricsRow counts={counts} />
      {(pinnedProjects.length > 0 || pickerProjects.length > 0) && (
        <PinnedProjects pinned={pinnedProjects} allProjects={pickerProjects} />
      )}
      <div className="grid gap-2.5 lg:grid-cols-2">
        <ActionItemsCard items={actionItems} />
        <TasksCard tasks={tasks} scope="today" />
      </div>
      <div className="grid gap-2.5 lg:grid-cols-2">
        <MeetingsCard meetings={meetings} scope="today" />
        <ProjectsCard projects={projects} />
      </div>
      <AIAssistPanel scope="daily" />
    </ItemDrawerProvider>
  );
}
