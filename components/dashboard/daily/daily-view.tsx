import { TopRow } from "./top-row";
import { TasksCard } from "./tasks-card";
import { ActionItemsCard } from "./action-items-card";
import { AIAssistPanel } from "./ai-assist-panel";
import { Scorecard } from "./scorecard";
import { KpiStrip } from "./kpi-strip";
import { ActivityCenter } from "@/components/town-hall/activity-center";
import { RelationshipHealth } from "@/components/dashboard/right/relationship-health";
import { ItemDrawerProvider } from "../item-drawer";
import type { ScorecardRow, KpiRow } from "@/db/queries/okrs";
import { PinnedProjects } from "../pinned-projects";
import type { PinnedProject } from "@/db/queries/pins";
import { BriefingCard } from "./briefing-card";
import { CustomizableDashboard } from "../customizable-dashboard";
import type { MentionSources } from "@/components/ui/mention-input";
import type { RefObject } from "@/components/town-hall/types";
import type { WorkspaceCountdown } from "@/db/queries/workspace-settings";
import type { FeedItem } from "@/db/queries/town-hall-feed";
import type { InitiativePick } from "@/db/queries/item-initiatives";
import type { DashActionItem, DashMeeting, DashTask, RelationshipRow } from "@/db/queries/dashboard";
import type { BlockedProject } from "@/db/queries/this-week";
import type { DashWidget } from "@/lib/dashboard/layout";

interface DailyViewProps {
  tasks: DashTask[];
  meetings: DashMeeting[];
  actionItems: DashActionItem[];
  pickerProjects: { id: string; title: string }[];
  members: { userId: string; displayName: string }[];
  docs: RefObject[];
  pinnedProjects: PinnedProject[];
  recentProjects: { id: string; title: string }[];
  relationship: RelationshipRow[];
  scorecard: ScorecardRow[];
  nowMs: number;
  tz: string;
  todayKey: string;
  workspaceId: string;
  countdown: WorkspaceCountdown | null;
  feed: FeedItem[];
  initiatives: InitiativePick[];
  kpis: KpiRow[];
  blocked: BlockedProject[];
  briefingBullets: string[];
  dashboardLayout: DashWidget[];
  townHallFeedLimit: number;
  initialItem?: { entityType: "action_item" | "milestone" | "meeting"; id: string } | null;
}

export function DailyView({
  tasks,
  meetings,
  actionItems,
  pickerProjects,
  members,
  docs,
  pinnedProjects,
  recentProjects,
  relationship,
  scorecard,
  nowMs,
  tz,
  todayKey,
  workspaceId,
  countdown,
  feed,
  initiatives,
  kpis,
  blocked,
  briefingBullets,
  dashboardLayout,
  townHallFeedLimit,
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
  const widgets = [
    {
      id: "town_hall",
      node: (
        <ActivityCenter
          workspaceId={workspaceId}
          initialFeed={feed}
          feedLimit={townHallFeedLimit}
          members={members}
          objects={townHallObjects}
          docs={docs}
          initiatives={initiatives}
          tz={tz}
          todayKey={todayKey}
          nowMs={nowMs}
        />
      ),
    },
    {
      id: "action_items",
      node: <ActionItemsCard items={actionItems} sources={mentionSources} />,
    },
    {
      id: "tasks",
      node: <TasksCard tasks={tasks} scope="today" sources={mentionSources} />,
    },
    {
      id: "pinned",
      node: <PinnedProjects pinned={pinnedProjects} allProjects={pickerProjects} recent={recentProjects} />,
    },
    {
      id: "relationships",
      node: <RelationshipHealth rows={relationship} />,
    },
    {
      id: "ai",
      node: <AIAssistPanel scope="daily" />,
    },
    {
      id: "scorecard",
      node: <Scorecard rows={scorecard} />,
    },
  ];

  return (
    <ItemDrawerProvider
      // Remount when the ?item= deep-link changes so it opens the new item.
      key={initialItem ? `${initialItem.entityType}:${initialItem.id}` : "none"}
      projects={pickerProjects}
      members={members}
      initialItem={initialItem}
    >
      {/* Top row: meetings agenda · tasks-due agenda · countdown (Angel Falls) */}
      <TopRow meetings={meetings} tasks={tasks} countdown={countdown} nowMs={nowMs} tz={tz} />

      {/* KPIs — slim, full-width strip */}
      <KpiStrip kpis={kpis} />

      <BriefingCard
        bullets={briefingBullets}
        actionItems={actionItems}
        tasks={tasks}
        blocked={blocked}
        meetings={meetings}
        nowMs={nowMs}
      />

      <CustomizableDashboard widgets={widgets} savedLayout={dashboardLayout} />
    </ItemDrawerProvider>
  );
}
