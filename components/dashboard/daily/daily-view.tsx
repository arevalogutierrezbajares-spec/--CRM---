import { TopRow } from "./top-row";
import { TasksCard } from "./tasks-card";
import { ActionItemsCard } from "./action-items-card";
import { AIAssistPanel } from "./ai-assist-panel";
import { BriefingCard } from "./briefing-card";
import { Scorecard } from "./scorecard";
import { KpiStrip } from "./kpi-strip";
import { ActivityCenter } from "@/components/town-hall/activity-center";
import { ItemDrawerProvider } from "../item-drawer";
import type { BlockedProject } from "@/db/queries/this-week";
import type { ScorecardRow, KpiRow } from "@/db/queries/okrs";
import { PinnedProjects } from "../pinned-projects";
import type { PinnedProject } from "@/db/queries/pins";
import type { MentionSources } from "@/components/ui/mention-input";
import type { RefObject } from "@/components/town-hall/types";
import type { WorkspaceCountdown } from "@/db/queries/workspace-settings";
import type { FeedItem } from "@/db/queries/town-hall-feed";
import type { InitiativePick } from "@/db/queries/item-initiatives";
import type {
  DashActionItem,
  DashCounts,
  DashMeeting,
  DashTask,
} from "@/db/queries/dashboard";

interface DailyViewProps {
  counts: DashCounts;
  tasks: DashTask[];
  meetings: DashMeeting[];
  actionItems: DashActionItem[];
  pickerProjects: { id: string; title: string }[];
  members: { userId: string; displayName: string }[];
  docs: RefObject[];
  pinnedProjects: PinnedProject[];
  recentProjects: { id: string; title: string }[];
  blocked: BlockedProject[];
  scorecard: ScorecardRow[];
  briefing: string[];
  nowMs: number;
  tz: string;
  todayKey: string;
  workspaceId: string;
  countdown: WorkspaceCountdown | null;
  feed: FeedItem[];
  initiatives: InitiativePick[];
  kpis: KpiRow[];
  initialItem?: { entityType: "action_item" | "milestone" | "meeting"; id: string } | null;
}

export function DailyView({
  counts,
  tasks,
  meetings,
  actionItems,
  pickerProjects,
  members,
  docs,
  pinnedProjects,
  recentProjects,
  blocked,
  scorecard,
  briefing,
  nowMs,
  tz,
  todayKey,
  workspaceId,
  countdown,
  feed,
  initiatives,
  kpis,
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
      {/* Top row: ordered meetings agenda · tasks due · countdown */}
      <TopRow counts={counts} meetings={meetings} countdown={countdown} nowMs={nowMs} tz={tz} />

      {/* Body: LEFT (wide) work column · MIDDLE feed/insights column */}
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2.5">
          <BriefingCard
            bullets={briefing}
            actionItems={actionItems}
            tasks={tasks}
            blocked={blocked}
            meetings={meetings}
            nowMs={nowMs}
          />
          <ActionItemsCard items={actionItems} sources={mentionSources} />
          <TasksCard tasks={tasks} scope="today" sources={mentionSources} />
        </div>

        <div className="flex flex-col gap-2.5">
          <KpiStrip kpis={kpis} />
          <ActivityCenter
            workspaceId={workspaceId}
            initialFeed={feed}
            members={members}
            objects={townHallObjects}
            docs={docs}
            initiatives={initiatives}
            tz={tz}
            todayKey={todayKey}
            nowMs={nowMs}
          />
          <PinnedProjects pinned={pinnedProjects} allProjects={pickerProjects} recent={recentProjects} />
          <AIAssistPanel scope="daily" />
          <Scorecard rows={scorecard} />
        </div>
      </div>
    </ItemDrawerProvider>
  );
}
