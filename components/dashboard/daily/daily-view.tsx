import { TopRow } from "./top-row";
import { TasksCard } from "./tasks-card";
import { ActionItemsCard } from "./action-items-card";
import { AIAssistPanel } from "./ai-assist-panel";
import { Scorecard } from "./scorecard";
import { DynamicKpiStrip } from "./dynamic-kpi-strip";
import { ActivityCenter } from "@/components/town-hall/activity-center";
import type { ScorecardRow } from "@/db/queries/okrs";
import { PinnedProjects } from "../pinned-projects";
import type { PinnedProject } from "@/db/queries/pins";
import { BriefingCard } from "./briefing-card";
import { CustomizableDashboard } from "../customizable-dashboard";
import type { MentionSources } from "@/components/ui/mention-input";
import type { RefObject } from "@/components/town-hall/types";
import type { WorkspaceCountdown } from "@/db/queries/workspace-settings";
import type { FeedItem } from "@/db/queries/town-hall-feed";
import type { InitiativePick } from "@/db/queries/item-initiatives";
import type { DashActionItem, DashMeeting, DashTask, HomeCommandMetric } from "@/db/queries/dashboard";
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
  scorecard: ScorecardRow[];
  nowMs: number;
  tz: string;
  todayKey: string;
  workspaceId: string;
  countdown: WorkspaceCountdown | null;
  feed: FeedItem[];
  initiatives: InitiativePick[];
  commandMetrics: HomeCommandMetric[];
  commandMetricsError?: string | null;
  blocked: BlockedProject[];
  briefingBullets: string[];
  dashboardLayout: DashWidget[];
  townHallFeedLimit: number;
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
  scorecard,
  nowMs,
  tz,
  todayKey,
  workspaceId,
  countdown,
  feed,
  initiatives,
  commandMetrics,
  commandMetricsError,
  blocked,
  briefingBullets,
  dashboardLayout,
  townHallFeedLimit,
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
      id: "tasks",
      node: <TasksCard tasks={tasks} scope="today" sources={mentionSources} />,
    },
    {
      id: "pinned",
      node: <PinnedProjects pinned={pinnedProjects} allProjects={pickerProjects} recent={recentProjects} nowMs={nowMs} />,
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
    <>
      {/* Top row: meetings agenda · tasks-due agenda · countdown (Angel Falls) */}
      <TopRow meetings={meetings} tasks={tasks} countdown={countdown} nowMs={nowMs} tz={tz} />

      <DynamicKpiStrip metrics={commandMetrics} error={commandMetricsError} />

      <BriefingCard
        bullets={briefingBullets}
        actionItems={actionItems}
        tasks={tasks}
        blocked={blocked}
        meetings={meetings}
        nowMs={nowMs}
      />

      {/* Action items live in the right rail on desktop; the rail is hidden below
          lg, so show them inline here on small screens (one visible copy per
          breakpoint — the rail copy is lg+). */}
      <div className="lg:hidden">
        <ActionItemsCard items={actionItems} sources={mentionSources} />
      </div>

      <CustomizableDashboard widgets={widgets} savedLayout={dashboardLayout} />
    </>
  );
}
