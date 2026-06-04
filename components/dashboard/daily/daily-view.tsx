import { MetricsRow } from "./metrics-row";
import { TasksCard } from "./tasks-card";
import { MeetingsCard } from "./meetings-card";
import { ProjectsCard } from "./projects-card";
import { ActionItemsCard } from "./action-items-card";
import { AIAssistPanel } from "./ai-assist-panel";
import { TodayBriefing } from "./today-briefing";
import { NeedsYouNow } from "./needs-you-now";
import { ItemDrawerProvider } from "../item-drawer";
import type { BlockedProject } from "@/db/queries/this-week";
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
  recentProjects: { id: string; title: string }[];
  blocked: BlockedProject[];
  nowMs: number;
  layout: DashWidget[];
  greeting: string;
  briefing: string[];
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
  recentProjects,
  blocked,
  nowMs,
  layout,
  greeting,
  briefing,
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
      <TodayBriefing greeting={greeting} bullets={briefing} />
      <NeedsYouNow actionItems={actionItems} tasks={tasks} blocked={blocked} meetings={meetings} nowMs={nowMs} />
      <MetricsRow counts={counts} />
      <CustomizableDashboard
        savedLayout={layout}
        widgets={[
          { id: "pinned", node: <PinnedProjects pinned={pinnedProjects} allProjects={pickerProjects} recent={recentProjects} /> },
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
