import { requireUser } from "@/lib/current-user";
import { todayInTz } from "@/lib/date/today";
import { DashboardShell } from "@/components/dashboard/shell/dashboard-shell";
import { RightColumn } from "@/components/dashboard/shell/right-column";
import { GreetingTyping } from "@/components/dashboard/shell/greeting-typing";
import { GreetingAudio } from "@/components/dashboard/shell/greeting-audio";
import { MuteButton } from "@/components/dashboard/shell/mute-button";
import { DemonButton } from "@/components/dashboard/shell/demon-button";
import { WinAudio } from "@/components/dashboard/shell/win-audio";
import { greetingIdentity } from "@/lib/greeting";
import { QuoteBubble } from "@/components/dashboard/daily/quote-bubble";
import { HOME_BUBBLE_MESSAGES } from "@/lib/quotes";
import { MiniCalendar } from "@/components/dashboard/right/mini-calendar";
import { PipelineSnapshot } from "@/components/dashboard/right/pipeline-snapshot";
import { TreasuryWidget } from "@/components/dashboard/right/treasury-widget";
import { SprintWidget } from "@/components/dashboard/right/sprint-widget";
import { treasurySnapshot, techSpendSummary, type TechSpendSummary, type TreasurySnapshot } from "@/db/queries/treasury";
import { getActiveSprint, type SprintWithStats } from "@/db/queries/work";
import { AiTechSpendCard } from "@/components/dashboard/right/ai-tech-spend-card";
import { getAnthropicSpendToday, type AnthropicSpend } from "@/lib/anthropic-budget";
import { DailyView } from "@/components/dashboard/daily/daily-view";
import { ItemDrawerProvider } from "@/components/dashboard/item-drawer";
import { ActionItemsCard } from "@/components/dashboard/daily/action-items-card";
import { listProjectsForPicker, listWorkspaceDocs } from "@/db/queries/items";
import type { RefObject } from "@/components/town-hall/types";
import { listWorkspaceMembers } from "@/db/queries/team";
import { DEFAULT_TOWN_HALL_FEED_LIMIT, listTownHallFeed, type FeedItem } from "@/db/queries/town-hall-feed";
import { getWorkspaceCountdown, type WorkspaceCountdown } from "@/db/queries/workspace-settings";
import { listInitiativesForPicker, type InitiativePick } from "@/db/queries/item-initiatives";
import { listPinnedProjects, listRecentProjects, type PinnedProject } from "@/db/queries/pins";
import { listScorecard, quarterOf, type ScorecardRow } from "@/db/queries/okrs";
import { getDashboardLayout } from "@/db/queries/dashboard-layout";
import { DEFAULT_WIDGETS, type DashWidget } from "@/lib/dashboard/layout";
import { WeeklyView } from "@/components/dashboard/weekly/weekly-view";
import { MonthlyView } from "@/components/dashboard/monthly/monthly-view";
import { DbBanner } from "@/components/db-banner";
import { safeRead } from "@/lib/db-status";
import {
  dashboardCounts,
  homeCommandMetrics,
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
  startOfMonth,
  startOfWeek,
  topAccountsThisMonth,
  type DashActionItem,
  type DashCounts,
  type DashMeeting,
  type DashProject,
  type DashTask,
  type HomeCommandMetric,
  type PipelineStageBar,
  type TopAccount,
} from "@/db/queries/dashboard";
import { listBlockedProjects, type BlockedProject, type DueItem } from "@/db/queries/this-week";

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
const EMPTY_AI_SPEND: AnthropicSpend = {
  tokensIn: 0,
  tokensOut: 0,
  costMillicents: 0,
};

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

const FALLBACK_COMMAND_METRICS: HomeCommandMetric[] = [
  {
    id: "beta_customers",
    label: "Beta customers",
    value: 0,
    subline: "KPI read unavailable",
    detail: "Beta customers data did not load. Check the database warning.",
    href: "/priorities",
    progressPct: 0,
    tone: "blue",
  },
  {
    id: "vav_launch",
    label: "VAV launch",
    value: 0,
    suffix: "%",
    subline: "launch read unavailable",
    detail: "VAV launch data did not load. Check the database warning.",
    href: "/lob",
    progressPct: 0,
    tone: "green",
  },
  {
    id: "influencers",
    label: "Influencers in pipeline",
    value: 0,
    subline: "KPI read unavailable",
    detail: "Influencer pipeline data did not load. Check the database warning.",
    href: "/priorities",
    progressPct: 0,
    tone: "purple",
  },
];

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

/**
 * The on-screen greeting title. Delegates to greetingIdentity() so the *displayed*
 * nickname always matches what the NIGO voice *says* (single source of truth).
 * Unknown teammates fall back to their first name on screen (the voice uses the
 * generic "Founder" clip).
 */
function formalTitle(displayName: string, email: string): string {
  const { slug, spokenTitle } = greetingIdentity(displayName, email);
  if (slug === "founder") return displayName.split(/\s+/)[0] || displayName;
  return spokenTitle;
}

/** Time-of-day period in the user's IANA timezone. */
function periodInTz(tz: string): "morning" | "afternoon" | "evening" {
  let h = 12;
  try {
    h = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(new Date()));
  } catch {
    /* default noon */
  }
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

export default async function HomePage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await props.searchParams;
  // A notification/deep-link (?item=) opens the drawer, which only mounts on the
  // daily view — so force daily when an item is being opened.
  const view = sp.item
    ? "daily"
    : sp.view === "weekly" || sp.view === "monthly"
      ? sp.view
      : "daily";
  // "Today" in the user's timezone — so overdue/due-today isn't a day off in the
  // evening for non-UTC users (e.g. Venezuela, UTC-4).
  const todayStr = todayInTz(user.timezone);
  // One canonical clock for every time-derived widget on Home (KPI pace, countdown, day buckets).
  const nowMs = new Date().getTime();
  // ?item=<type>:<id> deep-link (e.g. from a Town Hall #ref) → auto-open drawer.
  const initialItem = parseItemParam(sp.item);

  /* ── Persistent right-column data + counts ─────────────────────────── */

  const [
    countsRes,
    pipelineRes,
    eventDaysRes,
    blockedRes,
    treasuryRes,
    sprintRes,
    feedRes,
    membersRes,
    projectListRes,
    scorecardRes,
    docsRes,
    countdownRes,
    initiativesRes,
    aiSpendRes,
    techSpendRes,
    layoutRes,
  ] = await Promise.all([
    safeRead<DashCounts>(() => dashboardCounts(user.workspaceId, todayStr), EMPTY_COUNTS),
    safeRead<PipelineStageBar[]>(() => pipelineSnapshot(user.workspaceId), []),
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
    safeRead<FeedItem[]>(
      () => listTownHallFeed({ workspaceId: user.workspaceId, viewerId: user.id, limit: DEFAULT_TOWN_HALL_FEED_LIMIT }),
      [],
    ),
    // Loaded once, reused by the drawer pickers + Town Hall (no duplicate queries).
    safeRead<{ userId: string; displayName: string }[]>(
      () => listWorkspaceMembers(user.workspaceId).then((ms) => ms.map((m) => ({ userId: m.userId, displayName: m.displayName }))),
      [],
    ),
    safeRead<{ id: string; title: string }[]>(() => listProjectsForPicker(user.workspaceId), []),
    safeRead<ScorecardRow[]>(() => listScorecard(user.workspaceId, quarterOf(new Date(todayStr))), []),
    safeRead<RefObject[]>(() => listWorkspaceDocs(user.workspaceId), []),
    safeRead<WorkspaceCountdown | null>(() => getWorkspaceCountdown(user.workspaceId), null),
    safeRead<InitiativePick[]>(() => listInitiativesForPicker(user.workspaceId), []),
    safeRead<AnthropicSpend>(() => getAnthropicSpendToday(user.workspaceId), EMPTY_AI_SPEND),
    safeRead<TechSpendSummary>(
      () => techSpendSummary(user.workspaceId),
      {
        todayUsdCents: 0,
        monthToDateUsdCents: 0,
        categoryCount: 0,
      },
    ),
    safeRead<DashWidget[]>(() => getDashboardLayout(user.id), DEFAULT_WIDGETS.map((w) => ({ ...w }))),
  ]);

  const members = membersRes.data;
  const pickerProjects = projectListRes.data;

  /* ── View-specific data fetched conditionally ──────────────────────── */

  let dailyData: {
    tasks: DashTask[];
    meetings: DashMeeting[];
    actionItems: DashActionItem[];
    pickerProjects: { id: string; title: string }[];
    members: { userId: string; displayName: string }[];
    pinnedProjects: PinnedProject[];
    recentProjects: { id: string; title: string }[];
  } | null = null;
  let weeklyData: {
    tasks: DashTask[];
    meetings: DashMeeting[];
    projects: DashProject[];
    weekStart: Date;
    commandMetrics: HomeCommandMetric[];
    commandMetricsError: string | null;
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
    const [tasks, meetings, actionItems, pinnedProjects, recentProjects] = await Promise.all([
      safeRead<DashTask[]>(() => listTasksToday(user.workspaceId, todayStr), []),
      safeRead<DashMeeting[]>(() => listMeetingsToday(user.workspaceId), []),
      safeRead<DashActionItem[]>(() => listOpenActionItems(user.workspaceId, 12, todayStr), []),
      safeRead<PinnedProject[]>(() => listPinnedProjects(user.workspaceId, user.id, todayStr), []),
      safeRead<{ id: string; title: string }[]>(() => listRecentProjects(user.workspaceId, user.id, 8), []),
    ]);
    dailyData = {
      tasks: tasks.data,
      meetings: meetings.data,
      actionItems: actionItems.data,
      pickerProjects,
      members,
      pinnedProjects: pinnedProjects.data,
      recentProjects: recentProjects.data,
    };
  } else if (view === "weekly") {
    const [tasks, meetings, projects, commandMetrics] = await Promise.all([
      safeRead<DashTask[]>(() => listTasksThisWeek(user.workspaceId, todayStr), []),
      safeRead<DashMeeting[]>(() => listMeetingsThisWeek(user.workspaceId), []),
      safeRead<DashProject[]>(() => listActiveProjectsForDashboard(user.workspaceId, 6, todayStr), []),
      safeRead<HomeCommandMetric[]>(
        () => homeCommandMetrics(user.workspaceId),
        FALLBACK_COMMAND_METRICS,
      ),
    ]);
    weeklyData = {
      tasks: tasks.data,
      meetings: meetings.data,
      projects: projects.data,
      weekStart: startOfWeek(),
      commandMetrics: commandMetrics.data,
      commandMetricsError: commandMetrics.ok ? null : commandMetrics.error,
    };
  } else {
    const [meetings, projects, overdueTasks, top, stats] = await Promise.all([
      safeRead<DashMeeting[]>(() => listMeetingsThisMonth(user.workspaceId), []),
      safeRead<DashProject[]>(() => listActiveProjectsForDashboard(user.workspaceId, 6, todayStr), []),
      safeRead<DashTask[]>(() => listTasksThisMonth(user.workspaceId, todayStr), []),
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
      ownerName: null,
      ownerUserId: null,
    })) ?? [],
    dailyData?.meetings ?? weeklyData?.meetings ?? monthlyData?.meetings ?? [],
    blockedRes.data,
  );

  const dbError =
    !countsRes.ok ||
    !pipelineRes.ok ||
    !eventDaysRes.ok ||
    Boolean(weeklyData?.commandMetricsError);
  const dbErrorMessage =
    (countsRes as { error?: string }).error ??
    (pipelineRes as { error?: string }).error ??
    (eventDaysRes as { error?: string }).error ??
    weeklyData?.commandMetricsError ??
    "Database error";

  // Greeting persona (+ first-greeting swap) and period, computed once.
  const greet = greetingIdentity(user.displayName, user.email);
  const greetPeriod = periodInTz(user.timezone);

  // @mention sources for the right-rail Action items capture box.
  const actionItemSources = {
    people: members,
    projects: pickerProjects.map((p) => ({
      refType: "project" as const,
      refId: p.id,
      label: p.title,
      href: `/projects/${p.id}`,
    })),
    docs: docsRes.data,
  };

  return (
    <ItemDrawerProvider
      // Remount when the ?item= deep-link changes so it opens the new item.
      // Lifted to wrap both columns so the right-rail Action items can open the drawer.
      key={initialItem ? `${initialItem.entityType}:${initialItem.id}` : "none"}
      projects={pickerProjects}
      members={members}
      initialItem={initialItem}
    >
    <WinAudio />
    <DashboardShell
      email={user.email}
      displayName={user.displayName}
      header={
        <div className="flex min-w-0 flex-col justify-center gap-2.5 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <GreetingTyping title={formalTitle(user.displayName, user.email)} firstTitle={greet.firstSpokenTitle} period={greetPeriod} />
            <GreetingAudio slug={greet.slug} firstSlug={greet.firstSlug} period={greetPeriod} />
            <MuteButton />
            <DemonButton />
          </div>
          <QuoteBubble initialIndex={nowMs % HOME_BUBBLE_MESSAGES.length} />
        </div>
      }
      rightColumn={
        <RightColumn>
          <MiniCalendar eventDays={eventDaysRes.data} />
          {view === "daily" && dailyData && (
            <ActionItemsCard items={dailyData.actionItems} sources={actionItemSources} />
          )}
          <SprintWidget sprint={sprintRes.data} />
          <AiTechSpendCard ai={aiSpendRes.data} tech={techSpendRes.data} />
          <TreasuryWidget snapshot={treasuryRes.data} />
          <PipelineSnapshot stages={pipelineRes.data} />
        </RightColumn>
      }
    >
      {dbError && (
        <DbBanner
          error={dbErrorMessage}
        />
      )}

      {view === "daily" && dailyData && (
        <DailyView
          tasks={dailyData.tasks}
          meetings={dailyData.meetings}
          actionItems={dailyData.actionItems}
          pickerProjects={dailyData.pickerProjects}
          members={dailyData.members}
          pinnedProjects={dailyData.pinnedProjects}
          recentProjects={dailyData.recentProjects}
          docs={docsRes.data}
          scorecard={scorecardRes.data}
          nowMs={nowMs}
          tz={user.timezone}
          todayKey={todayStr}
          workspaceId={user.workspaceId}
          countdown={countdownRes.data}
          feed={feedRes.data}
          initiatives={initiativesRes.data}
          blocked={blockedRes.data}
          briefingBullets={briefing}
          dashboardLayout={layoutRes.data}
          townHallFeedLimit={DEFAULT_TOWN_HALL_FEED_LIMIT}
        />
      )}

      {view === "weekly" && weeklyData && (
        <WeeklyView
          counts={countsRes.data}
          tasks={weeklyData.tasks}
          meetings={weeklyData.meetings}
          projects={weeklyData.projects}
          weekStart={weeklyData.weekStart}
          commandMetrics={weeklyData.commandMetrics}
          commandMetricsError={weeklyData.commandMetricsError}
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
    </ItemDrawerProvider>
  );
}
