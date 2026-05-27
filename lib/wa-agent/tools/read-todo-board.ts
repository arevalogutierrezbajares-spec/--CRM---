/**
 * read_todo_board — canonical source of truth for action items.
 *
 * Anti-hallucination cornerstone: when the intent is todo_query, the workflow
 * gate marks this tool as REQUIRED before the agent may reply. This prevents
 * the agent from reciting todos from conversation history (which could be stale).
 *
 * Sources combined into one structured payload:
 *  1. Personal reminders (for this user, unfired, next 30 days)
 *  2. Overdue milestones (workspace-wide)
 *  3. Milestones assigned specifically to this user (pending/in_progress)
 *  4. Blocked projects (status=waiting)
 *  5. Action items extracted from recent meeting minutes (last 14 days)
 */

import { and, asc, desc, eq, gte, ilike, lt, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ToolEntry } from "./_types";

const { reminders, milestones, projects, meetings, contacts } = schema;

export const readTodoBoard: ToolEntry = {
  definition: {
    name: "read_todo_board",
    description:
      "Return the canonical to-do board for this user. " +
      "Combines personal reminders, overdue milestones, assigned milestones, " +
      "blocked projects, and action items from recent meeting minutes. " +
      "This is the ONLY authoritative source for action items — always call this " +
      "before listing todos. Never recite action items from memory.",
    input_schema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["all", "reminders", "milestones", "meetings", "blocked"],
          description: "Narrow to one category. Default: 'all'.",
        },
      },
    },
  },

  async execute(input, ctx) {
    const scope = (input.scope as string) ?? "all";
    const today = ctx.now.toISOString().slice(0, 10);

    // ── 1. Personal reminders (next 30 days, unfired) ────────────────────
    let myReminders: Array<{
      id: string;
      subject: string;
      dueAt: Date;
      recur: string;
    }> = [];
    if (scope === "all" || scope === "reminders") {
      const until = new Date(ctx.now);
      until.setDate(until.getDate() + 30);
      myReminders = await db
        .select({
          id: reminders.id,
          subject: reminders.subject,
          dueAt: reminders.dueAt,
          recur: reminders.recur,
        })
        .from(reminders)
        .where(
          and(
            eq(reminders.forUserId, ctx.userId),
            sql`${reminders.firedAt} IS NULL`,
            lte(reminders.dueAt, until),
          ),
        )
        .orderBy(asc(reminders.dueAt))
        .limit(20);
    }

    // ── 2. Overdue milestones (workspace-wide) ───────────────────────────
    let overdueMilestones: Array<{
      id: string;
      title: string;
      dueDate: string | null;
      projectTitle: string;
      assignedTo: string | null;
    }> = [];
    if (scope === "all" || scope === "milestones") {
      const rows = await db
        .select({
          id: milestones.id,
          title: milestones.title,
          dueDate: milestones.dueDate,
          assignedTo: milestones.assignedTo,
          projectTitle: projects.title,
        })
        .from(milestones)
        .innerJoin(projects, eq(projects.id, milestones.projectId))
        .where(
          and(
            eq(projects.workspaceId, ctx.workspaceId),
            sql`${milestones.status} <> 'done'`,
            sql`${milestones.dueDate} IS NOT NULL`,
            lt(milestones.dueDate, today),
          ),
        )
        .orderBy(asc(milestones.dueDate))
        .limit(10);
      overdueMilestones = rows;
    }

    // ── 3. Milestones assigned to this user (pending/in_progress) ────────
    let myMilestones: Array<{
      id: string;
      title: string;
      dueDate: string | null;
      status: string;
      projectTitle: string;
    }> = [];
    if (scope === "all" || scope === "milestones") {
      const rows = await db
        .select({
          id: milestones.id,
          title: milestones.title,
          dueDate: milestones.dueDate,
          status: milestones.status,
          projectTitle: projects.title,
        })
        .from(milestones)
        .innerJoin(projects, eq(projects.id, milestones.projectId))
        .where(
          and(
            eq(projects.workspaceId, ctx.workspaceId),
            eq(milestones.assignedTo, ctx.userId),
            or(
              eq(milestones.status, "pending"),
              eq(milestones.status, "blocked"),
            ),
          ),
        )
        .orderBy(asc(milestones.dueDate))
        .limit(10);
      myMilestones = rows;
    }

    // ── 4. Blocked projects ───────────────────────────────────────────────
    let blockedProjects: Array<{
      id: string;
      title: string;
      waitingOn: string | null;
    }> = [];
    if (scope === "all" || scope === "blocked") {
      blockedProjects = await db
        .select({
          id: projects.id,
          title: projects.title,
          waitingOn: projects.waitingOn,
        })
        .from(projects)
        .where(
          and(
            eq(projects.workspaceId, ctx.workspaceId),
            eq(projects.status, "waiting"),
          ),
        )
        .limit(10);
    }

    // ── 5. Action items from recent meeting minutes (last 14 days) ───────
    let meetingActionItems: Array<{
      meetingTitle: string;
      meetingDate: Date;
      items: string[];
    }> = [];
    if (scope === "all" || scope === "meetings") {
      const since = new Date(ctx.now);
      since.setDate(since.getDate() - 14);

      const recentMeetings = await db
        .select({
          id: meetings.id,
          title: meetings.title,
          scheduledAt: meetings.scheduledAt,
          minutes: meetings.minutes,
        })
        .from(meetings)
        .where(
          and(
            eq(meetings.workspaceId, ctx.workspaceId),
            gte(meetings.scheduledAt, since),
            sql`${meetings.minutes} IS NOT NULL`,
          ),
        )
        .orderBy(desc(meetings.scheduledAt))
        .limit(10);

      for (const m of recentMeetings) {
        if (!m.minutes) continue;
        // Extract action items: lines matching "[ ]", "TODO", "ACTION:", "- [ ]"
        const actionLines = m.minutes
          .split("\n")
          .filter((line) =>
            /(\[[ x]\]|TODO|ACTION:|follow[- ]?up|next step)/i.test(line) &&
            line.trim().length > 5,
          )
          .map((line) => line.trim())
          .slice(0, 5);

        if (actionLines.length > 0) {
          meetingActionItems.push({
            meetingTitle: m.title,
            meetingDate: m.scheduledAt,
            items: actionLines,
          });
        }
      }
    }

    // ── Summary counts for the speak line ────────────────────────────────
    const totalItems =
      myReminders.length +
      overdueMilestones.length +
      myMilestones.filter((m) => !overdueMilestones.find((o) => o.id === m.id)).length +
      blockedProjects.length +
      meetingActionItems.reduce((sum, m) => sum + m.items.length, 0);

    const speak =
      totalItems === 0
        ? "Your board is clear — nothing pending right now."
        : `Found ${totalItems} item${totalItems !== 1 ? "s" : ""}: ` +
          [
            myReminders.length && `${myReminders.length} reminder${myReminders.length !== 1 ? "s" : ""}`,
            overdueMilestones.length && `${overdueMilestones.length} overdue milestone${overdueMilestones.length !== 1 ? "s" : ""}`,
            blockedProjects.length && `${blockedProjects.length} blocked project${blockedProjects.length !== 1 ? "s" : ""}`,
            meetingActionItems.length && `action items from ${meetingActionItems.length} recent meeting${meetingActionItems.length !== 1 ? "s" : ""}`,
          ]
            .filter(Boolean)
            .join(", ") + ".";

    return {
      ok: true,
      data: {
        myReminders,
        overdueMilestones,
        myMilestones,
        blockedProjects,
        meetingActionItems,
      },
      speak,
    };
  },
};
