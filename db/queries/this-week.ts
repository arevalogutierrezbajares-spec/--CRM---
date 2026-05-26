import { and, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const { milestones, projects, contacts } = schema;

export type DueItem = {
  milestoneId: string;
  projectId: string;
  projectTitle: string;
  title: string;
  dueDate: string;
  status: "pending" | "blocked";
  isOverdue: boolean;
};

export type BlockedProject = {
  id: string;
  title: string;
  waitingOn: string;
  expectedUnblockDate: string | null;
  isOverdue: boolean;
};

export type StaleContact = {
  id: string;
  name: string;
  lastTouchAt: Date | null;
  daysSince: number | null;
};

const STALE_THRESHOLD_DAYS = 60;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function endOfWeekISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

export async function listDueThisWeek(ownerId: string): Promise<DueItem[]> {
  const today = todayISO();
  const end = endOfWeekISO();

  const rows = await db
    .select({
      milestoneId: milestones.id,
      projectId: projects.id,
      projectTitle: projects.title,
      title: milestones.title,
      dueDate: milestones.dueDate,
      status: milestones.status,
    })
    .from(milestones)
    .innerJoin(projects, eq(projects.id, milestones.projectId))
    .where(
      and(
        eq(projects.ownerId, ownerId),
        sql`${milestones.status} <> 'done'`,
        sql`${milestones.dueDate} IS NOT NULL`,
        lte(milestones.dueDate, end),
      ),
    );

  return rows
    .filter((r) => r.status !== "done")
    .map((r) => ({
      milestoneId: r.milestoneId,
      projectId: r.projectId,
      projectTitle: r.projectTitle,
      title: r.title,
      dueDate: r.dueDate as string,
      status: r.status as "pending" | "blocked",
      isOverdue: (r.dueDate as string) < today,
    }));
}

export async function listBlockedProjects(
  ownerId: string,
): Promise<BlockedProject[]> {
  const today = todayISO();
  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      waitingOn: projects.waitingOn,
      expectedUnblockDate: projects.expectedUnblockDate,
    })
    .from(projects)
    .where(
      and(eq(projects.ownerId, ownerId), eq(projects.status, "waiting")),
    );

  return rows
    .filter((r) => r.waitingOn !== null)
    .map((r) => ({
      id: r.id,
      title: r.title,
      waitingOn: r.waitingOn as string,
      expectedUnblockDate: r.expectedUnblockDate,
      isOverdue:
        r.expectedUnblockDate !== null && r.expectedUnblockDate < today,
    }));
}

export async function listStaleFriends(
  ownerId: string,
): Promise<StaleContact[]> {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - STALE_THRESHOLD_DAYS);

  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      lastTouchAt: contacts.lastTouchAt,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.ownerId, ownerId),
        eq(contacts.archived, false),
        eq(contacts.relationshipType, "friend"),
        or(isNull(contacts.lastTouchAt), lt(contacts.lastTouchAt, threshold)),
      ),
    )
    .limit(50);

  const now = new Date();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    lastTouchAt: r.lastTouchAt,
    daysSince: r.lastTouchAt
      ? Math.floor(
          (now.getTime() - r.lastTouchAt.getTime()) / 86400000,
        )
      : null,
  }));
}
