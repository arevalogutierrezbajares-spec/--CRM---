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
import type { MentionSources } from "@/components/ui/mention-input";
import type { RefObject } from "@/components/town-hall/types";
import type { WorkspaceCountdown } from "@/db/queries/workspace-settings";
import type { FeedItem } from "@/db/queries/town-hall-feed";
import type { InitiativePick } from "@/db/queries/item-initiatives";
import type { DashActionItem, DashMeeting, DashTask, RelationshipRow } from "@/db/queries/dashboard";

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
      {/* Top row: meetings agenda · tasks-due agenda · countdown (Angel Falls) */}
      <TopRow meetings={meetings} tasks={tasks} countdown={countdown} nowMs={nowMs} tz={tz} />

      {/* KPIs — slim, full-width strip */}
      <KpiStrip kpis={kpis} />

      {/* Trio — Work · Town Hall (wide) · Relationship — bottoms aligned */}
      <div className="grid grid-cols-1 items-stretch gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-2.5">
          <ActionItemsCard items={actionItems} sources={mentionSources} />
          <TasksCard tasks={tasks} scope="today" sources={mentionSources} />
        </div>
        <div className="min-w-0">
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
        </div>
        <div className="min-w-0">
          <RelationshipHealth rows={relationship} />
        </div>
      </div>

      {/* Pinned projects + AI assist — 50 / 50 */}
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        <PinnedProjects pinned={pinnedProjects} allProjects={pickerProjects} recent={recentProjects} />
        <AIAssistPanel scope="daily" />
      </div>

      {/* Scorecard — full width, skinny */}
      <Scorecard rows={scorecard} />
    </ItemDrawerProvider>
  );
}
