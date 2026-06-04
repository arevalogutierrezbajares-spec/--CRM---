import { MetricsRow } from "./metrics-row";
import { TasksCard } from "./tasks-card";
import { MeetingsCard } from "./meetings-card";
import { ProjectsCard } from "./projects-card";
import { ActionItemsCard } from "./action-items-card";
import { AIAssistPanel } from "./ai-assist-panel";
import { ItemDrawerProvider } from "../item-drawer";
import { PinnedProjects } from "../pinned-projects";
import { CustomizableDashboard } from "../customizable-dashboard";
import type { PinnedProject } from "@/db/queries/pins";
import type { DashWidget } from "@/lib/dashboard/layout";
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
  layout: DashWidget[];
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
  layout,
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
      <CustomizableDashboard
        savedLayout={layout}
        widgets={[
          { id: "pinned", node: <PinnedProjects pinned={pinnedProjects} allProjects={pickerProjects} /> },
          { id: "action_items", node: <ActionItemsCard items={actionItems} /> },
          { id: "tasks", node: <TasksCard tasks={tasks} scope="today" /> },
          { id: "meetings", node: <MeetingsCard meetings={meetings} scope="today" /> },
          { id: "projects", node: <ProjectsCard projects={projects} /> },
          { id: "ai", node: <AIAssistPanel scope="daily" /> },
        ]}
      />
    </ItemDrawerProvider>
  );
}
