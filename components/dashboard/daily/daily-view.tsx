import { TopRow } from "./top-row";
import { TasksCard } from "./tasks-card";
import { MeetingsCard } from "./meetings-card";
import { ProjectsCard } from "./projects-card";
import { ActionItemsCard } from "./action-items-card";
import { AIAssistPanel } from "./ai-assist-panel";
import { TodayBriefing } from "./today-briefing";
import { NeedsYouNow } from "./needs-you-now";
import { Scorecard } from "./scorecard";
import { ActivityCenter } from "@/components/town-hall/activity-center";
import { ItemDrawerProvider } from "../item-drawer";
import type { BlockedProject } from "@/db/queries/this-week";
import type { ScorecardRow } from "@/db/queries/okrs";
import { PinnedProjects } from "../pinned-projects";
import { CustomizableDashboard } from "../customizable-dashboard";
import type { PinnedProject } from "@/db/queries/pins";
import type { MentionSources } from "@/components/ui/mention-input";
import type { RefObject } from "@/components/town-hall/types";
import type { DashWidget } from "@/lib/dashboard/layout";
import type { WorkspaceCountdown } from "@/db/queries/workspace-settings";
import type { FeedItem } from "@/db/queries/town-hall-feed";
import type { InitiativePick } from "@/db/queries/item-initiatives";
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
  docs: RefObject[];
  pinnedProjects: PinnedProject[];
  recentProjects: { id: string; title: string }[];
  blocked: BlockedProject[];
  scorecard: ScorecardRow[];
  nowMs: number;
  layout: DashWidget[];
  greeting: string;
  briefing: string[];
  workspaceId: string;
  countdown: WorkspaceCountdown | null;
  feed: FeedItem[];
  initiatives: InitiativePick[];
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
  docs,
  pinnedProjects,
  recentProjects,
  blocked,
  scorecard,
  nowMs,
  layout,
  greeting,
  briefing,
  workspaceId,
  countdown,
  feed,
  initiatives,
  initialItem,
}: DailyViewProps) {
  const townHallObjects: RefObject[] = pickerProjects.map((p) => ({
    refType: "project" as const,
    refId: p.id,
    label: p.title,
    href: `/projects/${p.id}`,
  }));
  const mentionSources: MentionSources = {
    people: members,
    projects: townHallObjects,
    docs,
  };
  return (
    <ItemDrawerProvider
      // Remount when the ?item= deep-link changes so it opens the new item.
      key={initialItem ? `${initialItem.entityType}:${initialItem.id}` : "none"}
      projects={pickerProjects}
      members={members}
      initialItem={initialItem}
    >
      <TodayBriefing greeting={greeting} hasUrgent={briefing.length > 0} />

      {/* Top: exactly 3 — meetings today · tasks due · countdown */}
      <TopRow counts={counts} countdown={countdown} nowMs={nowMs} />

      {/* Town Hall — front & center: the activity log */}
      <ActivityCenter
        workspaceId={workspaceId}
        initialFeed={feed}
        members={members}
        objects={townHallObjects}
        docs={docs}
        initiatives={initiatives}
      />

      {/* The main body of work (stationary) */}
      <NeedsYouNow actionItems={actionItems} tasks={tasks} blocked={blocked} meetings={meetings} nowMs={nowMs} />
      <CustomizableDashboard
        savedLayout={layout}
        widgets={[
          { id: "pinned", node: <PinnedProjects pinned={pinnedProjects} allProjects={pickerProjects} recent={recentProjects} /> },
          { id: "action_items", node: <ActionItemsCard items={actionItems} sources={mentionSources} /> },
          { id: "tasks", node: <TasksCard tasks={tasks} scope="today" sources={mentionSources} /> },
          { id: "meetings", node: <MeetingsCard meetings={meetings} scope="today" /> },
          { id: "projects", node: <ProjectsCard projects={projects} /> },
          { id: "ai", node: <AIAssistPanel scope="daily" /> },
        ]}
      />

      {/* Scorecard last */}
      <Scorecard rows={scorecard} />
    </ItemDrawerProvider>
  );
}
