import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const {
  meetings,
  meetingAttendees,
  milestones,
  projects,
  contacts,
  pipelineStages,
  touches,
} = schema;

/* ─── Date helpers ──────────────────────────────────────────────────────── */

export function startOfDay(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function endOfDay(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
export function startOfWeek(d: Date = new Date()): Date {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  x.setDate(x.getDate() + diff);
  return x;
}
export function endOfWeek(d: Date = new Date()): Date {
  const start = startOfWeek(d);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return end;
}
export function startOfMonth(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
export function endOfMonth(d: Date = new Date()): Date {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  x.setHours(23, 59, 59, 999);
  return x;
}

/* ─── Tasks (milestones) ────────────────────────────────────────────────── */

export type DashTask = {
  id: string;
  title: string;
  dueDate: string;
  projectId: string;
  projectTitle: string;
  status: "pending" | "blocked";
  isOverdue: boolean;
};

async function listTasksDueBy(
  workspaceId: string,
  endDate: string,
): Promise<DashTask[]> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({
      id: milestones.id,
      title: milestones.title,
      dueDate: milestones.dueDate,
      status: milestones.status,
      projectId: projects.id,
      projectTitle: projects.title,
    })
    .from(milestones)
    .innerJoin(projects, eq(projects.id, milestones.projectId))
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        sql`${milestones.status} <> 'done'`,
        sql`${milestones.dueDate} IS NOT NULL`,
        sql`${milestones.dueDate} <= ${endDate}`,
      ),
    )
    .orderBy(milestones.dueDate);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    dueDate: r.dueDate as string,
    projectId: r.projectId,
    projectTitle: r.projectTitle,
    status: r.status as "pending" | "blocked",
    isOverdue: (r.dueDate as string) < today,
  }));
}

export async function listTasksToday(workspaceId: string) {
  return listTasksDueBy(workspaceId, new Date().toISOString().slice(0, 10));
}
export async function listTasksThisWeek(workspaceId: string) {
  return listTasksDueBy(workspaceId, endOfWeek().toISOString().slice(0, 10));
}
export async function listTasksThisMonth(workspaceId: string) {
  return listTasksDueBy(workspaceId, endOfMonth().toISOString().slice(0, 10));
}

/* ─── Meetings windows ──────────────────────────────────────────────────── */

export type DashMeeting = {
  id: string;
  title: string;
  scheduledAt: Date;
  location: string | null;
  type: "one_on_one" | "group" | "event" | "call";
  attendeeNames: string[];
};

async function listMeetingsBetween(
  workspaceId: string,
  from: Date,
  to: Date,
): Promise<DashMeeting[]> {
  const rows = await db
    .select({
      id: meetings.id,
      title: meetings.title,
      scheduledAt: meetings.scheduledAt,
      location: meetings.location,
      type: meetings.type,
    })
    .from(meetings)
    .where(
      and(
        eq(meetings.workspaceId, workspaceId),
        gte(meetings.scheduledAt, from),
        lt(meetings.scheduledAt, to),
      ),
    )
    .orderBy(meetings.scheduledAt);

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const attendees = await db
    .select({
      meetingId: meetingAttendees.meetingId,
      name: contacts.name,
    })
    .from(meetingAttendees)
    .innerJoin(contacts, eq(contacts.id, meetingAttendees.contactId))
    .where(inArray(meetingAttendees.meetingId, ids));

  return rows.map((m) => ({
    ...m,
    attendeeNames: attendees
      .filter((a) => a.meetingId === m.id)
      .map((a) => a.name),
  }));
}

export async function listMeetingsToday(workspaceId: string) {
  return listMeetingsBetween(workspaceId, startOfDay(), endOfDay());
}
export async function listMeetingsThisWeek(workspaceId: string) {
  return listMeetingsBetween(workspaceId, startOfWeek(), endOfWeek());
}
export async function listMeetingsThisMonth(workspaceId: string) {
  return listMeetingsBetween(workspaceId, startOfMonth(), endOfMonth());
}

/* ─── Metric row counts ─────────────────────────────────────────────────── */

export type DashCounts = {
  tasksToday: number;
  tasksTodayOverdue: number;
  meetingsToday: number;
  nextMeetingMinutes: number | null;
  activeProjects: number;
  nearestProjectDueDays: number | null;
  blockedProjects: number;
};

export async function dashboardCounts(
  workspaceId: string,
): Promise<DashCounts> {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();

  const [tasksRow, meetingsRow, projectsRow, blockedRow] = await Promise.all([
    db
      .select({
        id: milestones.id,
        dueDate: milestones.dueDate,
        status: milestones.status,
      })
      .from(milestones)
      .innerJoin(projects, eq(projects.id, milestones.projectId))
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          sql`${milestones.status} <> 'done'`,
          sql`${milestones.dueDate} <= ${today}`,
        ),
      ),
    db
      .select({ scheduledAt: meetings.scheduledAt })
      .from(meetings)
      .where(
        and(
          eq(meetings.workspaceId, workspaceId),
          gte(meetings.scheduledAt, startOfDay()),
          lt(meetings.scheduledAt, endOfDay()),
        ),
      )
      .orderBy(meetings.scheduledAt),
    db
      .select({ id: projects.id, dueDate: projects.dueDate })
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          eq(projects.status, "active"),
        ),
      ),
    db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          eq(projects.status, "waiting"),
        ),
      ),
  ]);

  const nextMeeting = meetingsRow.find((m) => m.scheduledAt > now);
  const nextMeetingMinutes = nextMeeting
    ? Math.round((nextMeeting.scheduledAt.getTime() - now.getTime()) / 60_000)
    : null;

  const upcomingProjectDates = projectsRow
    .map((p) => p.dueDate)
    .filter((d): d is string => d !== null)
    .filter((d) => d >= today)
    .sort();
  const nearestProjectDueDays = upcomingProjectDates[0]
    ? Math.max(
        0,
        Math.ceil(
          (new Date(upcomingProjectDates[0]).getTime() - now.getTime()) /
            86_400_000,
        ),
      )
    : null;

  return {
    tasksToday: tasksRow.length,
    tasksTodayOverdue: tasksRow.filter((r) => (r.dueDate as string) < today)
      .length,
    meetingsToday: meetingsRow.length,
    nextMeetingMinutes,
    activeProjects: projectsRow.length,
    nearestProjectDueDays,
    blockedProjects: blockedRow.length,
  };
}

/* ─── Pipeline snapshot: count per stage ────────────────────────────────── */

export type PipelineStageBar = {
  stageId: string;
  stageName: string;
  count: number;
};

export async function pipelineSnapshot(
  workspaceId: string,
): Promise<PipelineStageBar[]> {
  const rows = await db
    .select({
      stageId: pipelineStages.id,
      stageName: pipelineStages.name,
      sortOrder: pipelineStages.order,
      projectId: projects.id,
    })
    .from(projects)
    .innerJoin(pipelineStages, eq(pipelineStages.id, projects.currentStageId))
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.status, "active"),
      ),
    )
    .orderBy(asc(pipelineStages.order));

  const grouped = new Map<
    string,
    { stageId: string; stageName: string; sortOrder: number; count: number }
  >();
  for (const r of rows) {
    const existing = grouped.get(r.stageId);
    if (existing) {
      existing.count += 1;
    } else {
      grouped.set(r.stageId, {
        stageId: r.stageId,
        stageName: r.stageName,
        sortOrder: r.sortOrder,
        count: 1,
      });
    }
  }
  return Array.from(grouped.values())
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((g) => ({ stageId: g.stageId, stageName: g.stageName, count: g.count }));
}

/* ─── Relationship health ───────────────────────────────────────────────── */

export type RelationshipRow = {
  contactId: string;
  name: string;
  daysSinceLastTouch: number | null;
  score: number;
  band: "warm" | "neutral" | "cold";
};

export async function relationshipHealth(
  workspaceId: string,
  limit = 6,
): Promise<RelationshipRow[]> {
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      lastTouchAt: contacts.lastTouchAt,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        eq(contacts.archived, false),
      ),
    )
    .orderBy(desc(contacts.lastTouchAt))
    .limit(limit);

  const now = Date.now();
  return rows.map((r) => {
    const days = r.lastTouchAt
      ? Math.floor((now - r.lastTouchAt.getTime()) / 86_400_000)
      : null;
    const score =
      days === null
        ? 10
        : Math.max(0, Math.min(100, Math.round(100 - (days / 90) * 100)));
    const band: RelationshipRow["band"] =
      score >= 70 ? "warm" : score >= 30 ? "neutral" : "cold";
    return {
      contactId: r.id,
      name: r.name,
      daysSinceLastTouch: days,
      score,
      band,
    };
  });
}

/* ─── Active projects for Daily zone 4 ──────────────────────────────────── */

export type DashProject = {
  id: string;
  title: string;
  dueDate: string | null;
  openTasks: number;
  totalTasks: number;
  progressPct: number;
  status: "active" | "waiting" | "done" | "lost";
  nearestTaskTitle: string | null;
  nearestTaskDueDate: string | null;
  health: "green" | "amber" | "red";
};

export async function listActiveProjectsForDashboard(
  workspaceId: string,
  limit = 6,
): Promise<DashProject[]> {
  const projRows = await db
    .select({
      id: projects.id,
      title: projects.title,
      dueDate: projects.dueDate,
      status: projects.status,
      healthColor: projects.healthColor,
      expectedUnblockDate: projects.expectedUnblockDate,
    })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.status, "active"),
      ),
    )
    .orderBy(desc(projects.updatedAt))
    .limit(limit);

  if (projRows.length === 0) return [];
  const ids = projRows.map((p) => p.id);
  const ms = await db
    .select({
      projectId: milestones.projectId,
      title: milestones.title,
      dueDate: milestones.dueDate,
      status: milestones.status,
    })
    .from(milestones)
    .where(inArray(milestones.projectId, ids))
    .orderBy(milestones.dueDate);

  const today = new Date().toISOString().slice(0, 10);

  return projRows.map((p) => {
    const projMs = ms.filter((m) => m.projectId === p.id);
    const total = projMs.length;
    const done = projMs.filter((m) => m.status === "done").length;
    const open = total - done;
    const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;
    const nextOpen = projMs.find(
      (m) => m.status !== "done" && m.dueDate !== null,
    );

    const overdueOpen = projMs.filter(
      (m) =>
        m.status !== "done" &&
        m.dueDate !== null &&
        (m.dueDate as string) < today,
    ).length;

    let health: "green" | "amber" | "red" = "green";
    if (overdueOpen > 0) health = "red";
    else if (
      nextOpen?.dueDate &&
      (nextOpen.dueDate as string) <= today
    ) {
      health = "amber";
    } else if (p.healthColor === "amber") health = "amber";
    else if (p.healthColor === "red") health = "red";

    return {
      id: p.id,
      title: p.title,
      dueDate: p.dueDate,
      openTasks: open,
      totalTasks: total,
      progressPct,
      status: p.status,
      nearestTaskTitle: nextOpen?.title ?? null,
      nearestTaskDueDate: nextOpen?.dueDate ?? null,
      health,
    };
  });
}

/* ─── Top accounts (by touch count this month) ──────────────────────────── */

export type TopAccount = {
  contactId: string;
  name: string;
  organization: string | null;
  touchCount: number;
  band: "warm" | "neutral" | "cold";
};

export async function topAccountsThisMonth(
  workspaceId: string,
  limit = 6,
): Promise<TopAccount[]> {
  const monthStart = startOfMonth();
  const rows = await db
    .select({
      contactId: touches.contactId,
      contactName: contacts.name,
      organization: contacts.organization,
      lastTouchAt: contacts.lastTouchAt,
    })
    .from(touches)
    .innerJoin(contacts, eq(contacts.id, touches.contactId))
    .where(
      and(
        eq(touches.workspaceId, workspaceId),
        gte(touches.createdAt, monthStart),
      ),
    );

  // Group + count
  const grouped = new Map<
    string,
    { name: string; organization: string | null; lastTouchAt: Date | null; count: number }
  >();
  for (const r of rows) {
    const g = grouped.get(r.contactId);
    if (g) {
      g.count += 1;
    } else {
      grouped.set(r.contactId, {
        name: r.contactName,
        organization: r.organization,
        lastTouchAt: r.lastTouchAt,
        count: 1,
      });
    }
  }
  const now = Date.now();
  return Array.from(grouped.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([contactId, g]) => {
      const days = g.lastTouchAt
        ? Math.floor((now - g.lastTouchAt.getTime()) / 86_400_000)
        : null;
      const band: TopAccount["band"] =
        days === null ? "cold" : days <= 7 ? "warm" : days <= 30 ? "neutral" : "cold";
      return {
        contactId,
        name: g.name,
        organization: g.organization,
        touchCount: g.count,
        band,
      };
    });
}

/* ─── This-month aggregate stats ────────────────────────────────────────── */

export type MonthStatsT = {
  meetingsHeld: number;
  tasksCompleted: number;
  tasksTotal: number;
  projectsActive: number;
  contactsTouched: number;
};

export async function monthStats(workspaceId: string): Promise<MonthStatsT> {
  const monthStart = startOfMonth();
  const monthEnd = endOfMonth();

  const [meetingRows, msRows, projRows, touchRows] = await Promise.all([
    db
      .select({ id: meetings.id })
      .from(meetings)
      .where(
        and(
          eq(meetings.workspaceId, workspaceId),
          gte(meetings.scheduledAt, monthStart),
          lt(meetings.scheduledAt, monthEnd),
        ),
      ),
    db
      .select({ status: milestones.status, dueDate: milestones.dueDate })
      .from(milestones)
      .innerJoin(projects, eq(projects.id, milestones.projectId))
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          sql`${milestones.dueDate} >= ${monthStart.toISOString().slice(0, 10)}`,
          sql`${milestones.dueDate} <= ${monthEnd.toISOString().slice(0, 10)}`,
        ),
      ),
    db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          eq(projects.status, "active"),
        ),
      ),
    db
      .select({ contactId: touches.contactId })
      .from(touches)
      .where(
        and(
          eq(touches.workspaceId, workspaceId),
          gte(touches.createdAt, monthStart),
        ),
      ),
  ]);

  const uniqueContacts = new Set(touchRows.map((t) => t.contactId)).size;
  return {
    meetingsHeld: meetingRows.length,
    tasksCompleted: msRows.filter((m) => m.status === "done").length,
    tasksTotal: msRows.length,
    projectsActive: projRows.length,
    contactsTouched: uniqueContacts,
  };
}

/* ─── Event days (for mini calendar) ────────────────────────────────────── */

export async function meetingDaysThisMonth(
  workspaceId: string,
): Promise<string[]> {
  const monthStart = startOfMonth();
  const monthEnd = endOfMonth();
  const rows = await db
    .select({ scheduledAt: meetings.scheduledAt })
    .from(meetings)
    .where(
      and(
        eq(meetings.workspaceId, workspaceId),
        gte(meetings.scheduledAt, monthStart),
        lt(meetings.scheduledAt, monthEnd),
      ),
    );
  return Array.from(
    new Set(rows.map((r) => ymdLocal(r.scheduledAt))),
  );
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
