import { requireUser } from "@/lib/current-user";
import { DashboardShell } from "@/components/dashboard/shell/dashboard-shell";
import { RightColumn } from "@/components/dashboard/shell/right-column";
import { MiniCalendar } from "@/components/dashboard/right/mini-calendar";
import { PipelineSnapshot } from "@/components/dashboard/right/pipeline-snapshot";
import { RelationshipHealth } from "@/components/dashboard/right/relationship-health";
import { AIBriefing } from "@/components/dashboard/right/ai-briefing";
import { TreasuryWidget } from "@/components/dashboard/right/treasury-widget";
import { SprintWidget } from "@/components/dashboard/right/sprint-widget";
import { treasurySnapshot, type TreasurySnapshot } from "@/db/queries/treasury";
import { getActiveSprint, type SprintWithStats } from "@/db/queries/work";
import { DailyView } from "@/components/dashboard/daily/daily-view";
import { listProjectsForPicker } from "@/db/queries/items";
import { listWorkspaceMembers } from "@/db/queries/team";
import { listPosts, type PostView } from "@/db/queries/town-hall";
import { TownHallPanel } from "@/components/town-hall/town-hall-panel";
import { listPinnedProjects, type PinnedProject } from "@/db/queries/pins";
import { getDashboardLayout } from "@/db/queries/dashboard-layout";
import type { DashWidget } from "@/lib/dashboard/layout";
import { WeeklyView } from "@/components/dashboard/weekly/weekly-view";
import { MonthlyView } from "@/components/dashboard/monthly/monthly-view";
import { DbBanner } from "@/components/db-banner";
import { safeRead } from "@/lib/db-status";
import {
  dashboardCounts,
  listActiveProjectsForDashboard,
  listMeetingsThisMonth,
  listMeetingsThisWeek,
  listMeetingsToday,
  listTasksThisMonth,
  listTasksThisWeek,
  listTasksToday,
  listOpenActionItems,
  meetingDaysThisMonth,
  monthStats,
  pipelineSnapshot,
  relationshipHealth,
  startOfMonth,
  startOfWeek,
  topAccountsThisMonth,
  type DashActionItem,
  type DashCounts,
  type DashMeeting,
  type DashProject,
  type DashTask,
  type PipelineStageBar,
  type RelationshipRow,
  type TopAccount,
} from "@/db/queries/dashboard";

const EMPTY_TREASURY_SNAPSHOT: TreasurySnapshot = {
  cashUsdCents: 0,
  cashByCurrency: [],
  burnTodayUsdCents: 0,
  burn30dUsdCents: 0,
  burnMTDUsdCents: 0,
  inflowMTDUsdCents: 0,
  monthlyBurnRunRateUsdCents: 0,
  runwayMonths: null,
  accountCount: 0,
};
import {
  listBlockedProjects,
  type BlockedProject,
  type DueItem,
} from "@/db/queries/this-week";

type SearchParams = Promise<{ view?: string; item?: string }>;

const EMPTY_COUNTS: DashCounts = {
  tasksToday: 0,
  tasksTodayOverdue: 0,
  meetingsToday: 0,
  nextMeetingMinutes: null,
  activeProjects: 0,
  nearestProjectDueDays: null,
  blockedProjects: 0,
};

const EMPTY_MONTH_STATS = {
  meetingsHeld: 0,
  tasksCompleted: 0,
  tasksTotal: 0,
  projectsActive: 0,
  contactsTouched: 0,
};

function briefingBullets(
  counts: DashCounts,
  tasks: DashTask[],
  meetings: DashMeeting[],
  blocked: BlockedProject[],
): string[] {
  const out: string[] = [];
  if (counts.tasksTodayOverdue > 0) {
    out.push(
      `${counts.tasksTodayOverdue} task${counts.tasksTodayOverdue === 1 ? "" : "s"} overdue — clear before noon.`,
    );
  } else if (counts.tasksToday > 0) {
    out.push(`${counts.tasksToday} task${counts.tasksToday === 1 ? "" : "s"} on deck for today.`);
  }
  if (counts.nextMeetingMinutes !== null) {
    if (counts.nextMeetingMinutes < 30) {
      const m = meetings.find((mm) => mm.scheduledAt.getTime() > Date.now());
      out.push(`Next meeting in ${counts.nextMeetingMinutes}m${m ? ` — ${m.title}` : ""}.`);
    } else if (counts.meetingsToday > 0) {
      out.push(`${counts.meetingsToday} meeting${counts.meetingsToday === 1 ? "" : "s"} on the calendar today.`);
    }
  }
  if (blocked.length > 0) {
    out.push(
      `${blocked.length} project${blocked.length === 1 ? "" : "s"} blocked — check what's needed to unblock.`,
    );
  }
  return out.slice(0, 4);
}

type InitialItem = { entityType: "action_item" | "milestone" | "meeting"; id: string } | null;

function parseItemParam(raw: string | string[] | undefined): InitialItem {
  if (typeof raw !== "string") return null;
  const i = raw.indexOf(":");
  if (i < 0) return null;
  const t = raw.slice(0, i);
  const id = raw.slice(i + 1);
  if ((t === "action_item" || t === "milestone" || t === "meeting") && id) {
    return { entityType: t, id };
  }
  return null;
}

export default async function HomePage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const view = sp.view === "weekly" || sp.view === "monthly" ? sp.view : "daily";
  // ?item=<type>:<id> deep-link (e.g. from a Town Hall #ref) → auto-open drawer.
  const initialItem = parseItemParam(sp.item);

  /* ── Persistent right-column data + counts ─────────────────────────── */

  const [
    countsRes,
    pipelineRes,
    relRes,
    eventDaysRes,
    blockedRes,
    treasuryRes,
    sprintRes,
    townHallPostsRes,
    townHallMembersRes,
  ] = await Promise.all([
    safeRead<DashCounts>(() => dashboardCounts(user.workspaceId), EMPTY_COUNTS),
    safeRead<PipelineStageBar[]>(() => pipelineSnapshot(user.workspaceId), []),
    safeRead<RelationshipRow[]>(() => relationshipHealth(user.workspaceId, 6), []),
    safeRead<string[]>(() => meetingDaysThisMonth(user.workspaceId), []),
    safeRead<BlockedProject[]>(() => listBlockedProjects(user.workspaceId), []),
    safeRead<TreasurySnapshot>(
      () => treasurySnapshot(user.workspaceId),
      EMPTY_TREASURY_SNAPSHOT,
    ),
    safeRead<SprintWithStats | null>(
      () => getActiveSprint(user.workspaceId),
      null,
    ),
    safeRead<PostView[]>(() => listPosts({ workspaceId: user.workspaceId, limit: 40 }), []),
    safeRead<{ userId: string; displayName: string }[]>(
      () => listWorkspaceMembers(user.workspaceId).then((ms) => ms.map((m) => ({ userId: m.userId, displayName: m.displayName }))),
      [],
    ),
  ]);

  // Town Hall chat panel (right rail) — members + #-referenceable projects.
  const townHallObjects = (
    await safeRead<{ id: string; title: string }[]>(() => listProjectsForPicker(user.workspaceId), [])
  ).data.map((p) => ({ refType: "project" as const, refId: p.id, label: p.title, href: `/projects/${p.id}` }));

  /* ── View-specific data fetched conditionally ──────────────────────── */

  let dailyData: {
    tasks: DashTask[];
    meetings: DashMeeting[];
    projects: DashProject[];
    actionItems: DashActionItem[];
    pickerProjects: { id: string; title: string }[];
    members: { userId: string; displayName: string }[];
    pinnedProjects: PinnedProject[];
    layout: DashWidget[];
  } | null = null;
  let weeklyData: {
    tasks: DashTask[];
    meetings: DashMeeting[];
    projects: DashProject[];
    weekStart: Date;
  } | null = null;
  let monthlyData: {
    meetings: DashMeeting[];
    projects: DashProject[];
    overdueTasks: DueItem[];
    topAccounts: TopAccount[];
    monthStatsT: typeof EMPTY_MONTH_STATS;
    monthStart: Date;
  } | null = null;

  if (view === "daily") {
    const [tasks, meetings, projects, actionItems, pickerProjects, members, pinnedProjects] = await Promise.all([
      safeRead<DashTask[]>(() => listTasksToday(user.workspaceId), []),
      safeRead<DashMeeting[]>(() => listMeetingsToday(user.workspaceId), []),
      safeRead<DashProject[]>(() => listActiveProjectsForDashboard(user.workspaceId, 6), []),
      safeRead<DashActionItem[]>(() => listOpenActionItems(user.workspaceId, 12), []),
      safeRead<{ id: string; title: string }[]>(() => listProjectsForPicker(user.workspaceId), []),
      safeRead<{ userId: string; displayName: string }[]>(
        () =>
          listWorkspaceMembers(user.workspaceId).then((ms) =>
            ms.map((m) => ({ userId: m.userId, displayName: m.displayName })),
          ),
        [],
      ),
      safeRead<PinnedProject[]>(() => listPinnedProjects(user.workspaceId, user.id), []),
    ]);
    const layout = await getDashboardLayout(user.id);
    dailyData = {
      tasks: tasks.data,
      meetings: meetings.data,
      projects: projects.data,
      actionItems: actionItems.data,
      pickerProjects: pickerProjects.data,
      members: members.data,
      pinnedProjects: pinnedProjects.data,
      layout,
    };
  } else if (view === "weekly") {
    const [tasks, meetings, projects] = await Promise.all([
      safeRead<DashTask[]>(() => listTasksThisWeek(user.workspaceId), []),
      safeRead<DashMeeting[]>(() => listMeetingsThisWeek(user.workspaceId), []),
      safeRead<DashProject[]>(() => listActiveProjectsForDashboard(user.workspaceId, 6), []),
    ]);
    weeklyData = {
      tasks: tasks.data,
      meetings: meetings.data,
      projects: projects.data,
      weekStart: startOfWeek(),
    };
  } else {
    const [meetings, projects, overdueTasks, top, stats] = await Promise.all([
      safeRead<DashMeeting[]>(() => listMeetingsThisMonth(user.workspaceId), []),
      safeRead<DashProject[]>(() => listActiveProjectsForDashboard(user.workspaceId, 6), []),
      safeRead<DashTask[]>(() => listTasksThisMonth(user.workspaceId), []),
      safeRead<TopAccount[]>(() => topAccountsThisMonth(user.workspaceId, 6), []),
      safeRead(() => monthStats(user.workspaceId), EMPTY_MONTH_STATS),
    ]);
    // Coerce DashTask → DueItem shape for RiskFlags reuse
    const overdueAsDueItems: DueItem[] = overdueTasks.data
      .filter((t) => t.isOverdue)
      .map((t) => ({
        milestoneId: t.id,
        projectId: t.projectId,
        projectTitle: t.projectTitle,
        title: t.title,
        dueDate: t.dueDate,
        status: t.status,
        isOverdue: t.isOverdue,
      }));
    monthlyData = {
      meetings: meetings.data,
      projects: projects.data,
      overdueTasks: overdueAsDueItems,
      topAccounts: top.data,
      monthStatsT: stats.data,
      monthStart: startOfMonth(),
    };
  }

  /* ── Briefing bullets for right column ─────────────────────────────── */

  const briefing = briefingBullets(
    countsRes.data,
    dailyData?.tasks ?? weeklyData?.tasks ?? monthlyData?.overdueTasks.map((t) => ({
      id: t.milestoneId,
      title: t.title,
      dueDate: t.dueDate,
      projectId: t.projectId,
      projectTitle: t.projectTitle,
      status: t.status,
      isOverdue: t.isOverdue,
    })) ?? [],
    dailyData?.meetings ?? weeklyData?.meetings ?? monthlyData?.meetings ?? [],
    blockedRes.data,
  );

  const dbError =
    !countsRes.ok || !pipelineRes.ok || !relRes.ok || !eventDaysRes.ok;

  return (
    <DashboardShell
      email={user.email}
      displayName={user.displayName}
      rightColumn={
        <RightColumn>
          <TownHallPanel
            workspaceId={user.workspaceId}
            initialPosts={townHallPostsRes.data}
            members={townHallMembersRes.data}
            objects={townHallObjects}
          />
          <MiniCalendar eventDays={eventDaysRes.data} />
          <SprintWidget sprint={sprintRes.data} />
          <TreasuryWidget snapshot={treasuryRes.data} />
          <AIBriefing bullets={briefing} />
          <PipelineSnapshot stages={pipelineRes.data} />
          <RelationshipHealth rows={relRes.data} />
        </RightColumn>
      }
    >
      {dbError && (
        <DbBanner
          error={
            (countsRes as { error?: string }).error ??
            (pipelineRes as { error?: string }).error ??
            "Database error"
          }
        />
      )}

      {view === "daily" && dailyData && (
        <DailyView
          counts={countsRes.data}
          tasks={dailyData.tasks}
          meetings={dailyData.meetings}
          projects={dailyData.projects}
          actionItems={dailyData.actionItems}
          pickerProjects={dailyData.pickerProjects}
          members={dailyData.members}
          pinnedProjects={dailyData.pinnedProjects}
          layout={dailyData.layout}
          initialItem={initialItem}
        />
      )}

      {view === "weekly" && weeklyData && (
        <WeeklyView
          counts={countsRes.data}
          tasks={weeklyData.tasks}
          meetings={weeklyData.meetings}
          projects={weeklyData.projects}
          weekStart={weeklyData.weekStart}
        />
      )}

      {view === "monthly" && monthlyData && (
        <MonthlyView
          monthStart={monthlyData.monthStart}
          meetings={monthlyData.meetings}
          projects={monthlyData.projects}
          overdueTasks={monthlyData.overdueTasks}
          blocked={blockedRes.data}
          topAccounts={monthlyData.topAccounts}
          monthStats={monthlyData.monthStatsT}
        />
      )}
    </DashboardShell>
  );
}
