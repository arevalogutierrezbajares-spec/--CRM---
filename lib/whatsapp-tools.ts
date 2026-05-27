/**
 * WhatsApp agent tool catalog.
 *
 * Tools are pure functions over the DB. They never read process.env directly
 * (the caller passes workspaceId + userId) and they never call WhatsApp
 * themselves — the agent loop owns I/O. Trivial to unit-test.
 */

import { and, asc, desc, eq, gte, ilike, inArray, lt, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ClaudeToolDef } from "@/lib/anthropic";

const {
  contacts,
  contactTags,
  tags,
  touches,
  projects,
  milestones,
  meetings,
  reminders,
} = schema;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ToolResult =
  | { ok: true; data: unknown; speak?: string }
  | { ok: false; error: string };

export type ToolContext = {
  workspaceId: string;
  userId: string;
  ownerTimezone: string;
  now: Date;
};

type ToolExecutor = (
  input: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<ToolResult>;

type ToolEntry = { definition: ClaudeToolDef; execute: ToolExecutor };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function safeStr(v: unknown, max = 1000): string {
  if (typeof v !== "string") return "";
  return v.slice(0, max).trim();
}

function pickContactSummary(
  rows: Array<{
    id: string;
    name: string;
    relationshipType: string;
    organization: string | null;
  }>,
) {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    relationship: r.relationshipType,
    organization: r.organization,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tools
// ─────────────────────────────────────────────────────────────────────────────

const TOOLS: Record<string, ToolEntry> = {
  // ─── find_contact ────────────────────────────────────────────────────────
  find_contact: {
    definition: {
      name: "find_contact",
      description:
        "Fuzzy-search the workspace's contacts by name, organization, or channel value. " +
        "Returns up to 5 matches. Use this BEFORE any tool that needs a contact_id.",
      input_schema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Name, org, or partial phone/email to match",
          },
        },
        required: ["query"],
      },
    },
    async execute(input, ctx) {
      const q = safeStr(input.query, 120);
      if (!q) return { ok: false, error: "query is required" };
      const like = `%${q}%`;
      const direct = await db
        .select({
          id: contacts.id,
          name: contacts.name,
          relationshipType: contacts.relationshipType,
          organization: contacts.organization,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.workspaceId, ctx.workspaceId),
            eq(contacts.archived, false),
            or(ilike(contacts.name, like), ilike(contacts.organization, like)),
          ),
        )
        .limit(5);
      return {
        ok: true,
        data: { matches: pickContactSummary(direct) },
        speak:
          direct.length === 0
            ? `No contacts match "${q}".`
            : direct.length === 1
              ? `Found ${direct[0].name}.`
              : `Found ${direct.length} matches.`,
      };
    },
  },

  // ─── create_contact ──────────────────────────────────────────────────────
  create_contact: {
    definition: {
      name: "create_contact",
      description:
        "Create a new contact. Use ONLY after find_contact returned no matches AND the user confirmed creation.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: ["person", "org"] },
          relationship: {
            type: "string",
            enum: ["friend", "lead", "partner", "prospect"],
          },
          organization: { type: "string" },
          intro: {
            type: "string",
            description:
              "Free-text intro chain — who introduced you, where you met.",
          },
        },
        required: ["name"],
      },
    },
    async execute(input, ctx) {
      const name = safeStr(input.name, 120);
      if (!name) return { ok: false, error: "name is required" };
      const [row] = await db
        .insert(contacts)
        .values({
          name,
          type: (input.type as "person" | "org") ?? "person",
          relationshipType:
            (input.relationship as
              | "friend"
              | "lead"
              | "partner"
              | "prospect") ?? "prospect",
          organization: safeStr(input.organization) || null,
          introChainFromText: safeStr(input.intro) || null,
          workspaceId: ctx.workspaceId,
          createdBy: ctx.userId,
        })
        .returning({ id: contacts.id, name: contacts.name });
      return {
        ok: true,
        data: row,
        speak: `Created contact ${row.name}.`,
      };
    },
  },

  // ─── log_touch ───────────────────────────────────────────────────────────
  log_touch: {
    definition: {
      name: "log_touch",
      description:
        "Append a touch (interaction note) to a contact. Bumps last_touch_at. " +
        "Channels: manual (default), email, whatsapp, call, meeting, voice_memo, obsidian.",
      input_schema: {
        type: "object",
        properties: {
          contact_id: { type: "string" },
          body: { type: "string" },
          channel: {
            type: "string",
            enum: [
              "manual",
              "email",
              "whatsapp",
              "call",
              "meeting",
              "voice_memo",
              "obsidian",
            ],
          },
          project_id: { type: "string" },
        },
        required: ["contact_id", "body"],
      },
    },
    async execute(input, ctx) {
      const contactId = safeStr(input.contact_id);
      const body = safeStr(input.body, 2000);
      if (!contactId || !body)
        return { ok: false, error: "contact_id and body are required" };

      const [c] = await db
        .select({ id: contacts.id, name: contacts.name })
        .from(contacts)
        .where(
          and(
            eq(contacts.id, contactId),
            eq(contacts.workspaceId, ctx.workspaceId),
          ),
        )
        .limit(1);
      if (!c) return { ok: false, error: "Contact not found" };

      const [row] = await db
        .insert(touches)
        .values({
          contactId,
          body,
          channel:
            (input.channel as
              | "manual"
              | "email"
              | "whatsapp"
              | "call"
              | "meeting"
              | "voice_memo"
              | "obsidian") ?? "manual",
          projectId: (safeStr(input.project_id) || null) as string | null,
          workspaceId: ctx.workspaceId,
          createdBy: ctx.userId,
        })
        .returning({ id: touches.id });

      await db
        .update(contacts)
        .set({ lastTouchAt: ctx.now, updatedAt: ctx.now })
        .where(eq(contacts.id, contactId));

      return {
        ok: true,
        data: { id: row.id, contactName: c.name },
        speak: `Logged touch on ${c.name}.`,
      };
    },
  },

  // ─── contact_summary ─────────────────────────────────────────────────────
  contact_summary: {
    definition: {
      name: "contact_summary",
      description:
        "Return a brief on a contact: last 5 touches, organization, relationship.",
      input_schema: {
        type: "object",
        properties: { contact_id: { type: "string" } },
        required: ["contact_id"],
      },
    },
    async execute(input, ctx) {
      const contactId = safeStr(input.contact_id);
      const [c] = await db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.id, contactId),
            eq(contacts.workspaceId, ctx.workspaceId),
          ),
        )
        .limit(1);
      if (!c) return { ok: false, error: "Contact not found" };
      const recent = await db
        .select({
          channel: touches.channel,
          body: touches.body,
          createdAt: touches.createdAt,
        })
        .from(touches)
        .where(eq(touches.contactId, contactId))
        .orderBy(desc(touches.createdAt))
        .limit(5);
      return {
        ok: true,
        data: {
          name: c.name,
          relationship: c.relationshipType,
          organization: c.organization,
          lastTouchAt: c.lastTouchAt,
          touches: recent.map((t) => ({
            channel: t.channel,
            body: t.body.slice(0, 280),
            at: t.createdAt,
          })),
        },
      };
    },
  },

  // ─── find_project ────────────────────────────────────────────────────────
  find_project: {
    definition: {
      name: "find_project",
      description:
        "Search projects by title fragment. Returns up to 5 matches with status.",
      input_schema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
    async execute(input, ctx) {
      const q = safeStr(input.query, 120);
      if (!q) return { ok: false, error: "query is required" };
      const rows = await db
        .select({
          id: projects.id,
          title: projects.title,
          status: projects.status,
        })
        .from(projects)
        .where(
          and(
            eq(projects.workspaceId, ctx.workspaceId),
            ilike(projects.title, `%${q}%`),
          ),
        )
        .limit(5);
      return { ok: true, data: { matches: rows } };
    },
  },

  // ─── mark_milestone_done ─────────────────────────────────────────────────
  mark_milestone_done: {
    definition: {
      name: "mark_milestone_done",
      description:
        "Mark a project milestone as done. Use ONLY after confirming with the user " +
        "(destructive). If the user said 'mark X done', call this with the milestone id.",
      input_schema: {
        type: "object",
        properties: { milestone_id: { type: "string" } },
        required: ["milestone_id"],
      },
    },
    async execute(input, ctx) {
      const id = safeStr(input.milestone_id);
      const [m] = await db
        .select({ id: milestones.id, title: milestones.title })
        .from(milestones)
        .where(
          and(
            eq(milestones.id, id),
            eq(milestones.workspaceId, ctx.workspaceId),
          ),
        )
        .limit(1);
      if (!m) return { ok: false, error: "Milestone not found" };
      await db
        .update(milestones)
        .set({ status: "done", completedAt: ctx.now })
        .where(eq(milestones.id, id));
      return {
        ok: true,
        data: { id, title: m.title },
        speak: `Marked "${m.title}" done.`,
      };
    },
  },

  // ─── status_report ───────────────────────────────────────────────────────
  status_report: {
    definition: {
      name: "status_report",
      description:
        "Return the same data the This-Week page shows: counts of overdue " +
        "milestones, blocked projects, and stale friends (no touch in 60+ days).",
      input_schema: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["all", "overdue", "blocked", "stale"],
            description: "Limit the report to one category. Defaults to 'all'.",
          },
        },
      },
    },
    async execute(input, ctx) {
      const scope = (input.scope as string) ?? "all";
      const today = ctx.now.toISOString().slice(0, 10);

      const result: Record<string, unknown> = {};
      if (scope === "all" || scope === "overdue") {
        const overdue = await db
          .select({
            id: milestones.id,
            title: milestones.title,
            projectId: milestones.projectId,
            dueDate: milestones.dueDate,
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
          .limit(10);
        result.overdue = overdue;
      }
      if (scope === "all" || scope === "blocked") {
        const blocked = await db
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
        result.blocked = blocked;
      }
      if (scope === "all" || scope === "stale") {
        const threshold = new Date(ctx.now.getTime() - 60 * 86400000);
        const stale = await db
          .select({
            id: contacts.id,
            name: contacts.name,
            lastTouchAt: contacts.lastTouchAt,
          })
          .from(contacts)
          .where(
            and(
              eq(contacts.workspaceId, ctx.workspaceId),
              eq(contacts.archived, false),
              eq(contacts.relationshipType, "friend"),
              or(
                sql`${contacts.lastTouchAt} IS NULL`,
                lt(contacts.lastTouchAt, threshold),
              ),
            ),
          )
          .limit(10);
        result.stale = stale;
      }
      return { ok: true, data: result };
    },
  },

  // ─── schedule_reminder ───────────────────────────────────────────────────
  schedule_reminder: {
    definition: {
      name: "schedule_reminder",
      description:
        "Schedule a reminder for the texting user. Pass a fully-resolved ISO datetime in due_at_iso. " +
        "Recur defaults to 'once'. For weekly recur, set recur_day=0..6 (0=Sun). " +
        "For monthly recur, set recur_day=1..31.",
      input_schema: {
        type: "object",
        properties: {
          subject: { type: "string" },
          due_at_iso: {
            type: "string",
            description:
              "Resolved ISO-8601 timestamp with timezone offset. Example: '2026-06-02T09:00-04:00'.",
          },
          recur: {
            type: "string",
            enum: ["once", "daily", "weekly", "monthly"],
          },
          recur_day: { type: "integer", minimum: 0, maximum: 31 },
          recur_time_hhmm: {
            type: "string",
            description: "For recur != once: 'HH:MM' in owner's timezone.",
          },
          source_contact_id: { type: "string" },
          source_project_id: { type: "string" },
        },
        required: ["subject", "due_at_iso"],
      },
    },
    async execute(input, ctx) {
      const subject = safeStr(input.subject, 240);
      const iso = safeStr(input.due_at_iso, 50);
      if (!subject || !iso)
        return { ok: false, error: "subject and due_at_iso are required" };
      const dueAt = new Date(iso);
      if (Number.isNaN(dueAt.getTime()))
        return { ok: false, error: `Couldn't parse due_at_iso="${iso}"` };

      const recur =
        (input.recur as "once" | "daily" | "weekly" | "monthly") ?? "once";
      const recurTimeRaw = safeStr(input.recur_time_hhmm, 5);
      const recurTime =
        recurTimeRaw && /^\d{2}:\d{2}$/.test(recurTimeRaw)
          ? recurTimeRaw + ":00"
          : null;

      const [row] = await db
        .insert(reminders)
        .values({
          workspaceId: ctx.workspaceId,
          forUserId: ctx.userId,
          createdBy: ctx.userId,
          subject,
          dueAt,
          recur,
          recurDay:
            typeof input.recur_day === "number"
              ? (input.recur_day as number)
              : null,
          recurTime,
          sourceContactId: safeStr(input.source_contact_id) || null,
          sourceProjectId: safeStr(input.source_project_id) || null,
        })
        .returning({ id: reminders.id });

      const friendly = dueAt.toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: ctx.ownerTimezone,
      });
      return {
        ok: true,
        data: { id: row.id, dueAt },
        speak:
          recur === "once"
            ? `Will remind you ${friendly} about ${subject}.`
            : `Will remind you ${recur} (starting ${friendly}) about ${subject}.`,
      };
    },
  },

  // ─── list_reminders ──────────────────────────────────────────────────────
  list_reminders: {
    definition: {
      name: "list_reminders",
      description:
        "Return your upcoming reminders. Default scope is the next 7 days.",
      input_schema: {
        type: "object",
        properties: {
          scope: { type: "string", enum: ["today", "week", "all"] },
        },
      },
    },
    async execute(input, ctx) {
      const scope = (input.scope as string) ?? "week";
      let until = new Date(ctx.now);
      if (scope === "today") until.setDate(until.getDate() + 1);
      else if (scope === "week") until.setDate(until.getDate() + 7);
      else until = new Date(2999, 0, 1);

      const rows = await db
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

      return { ok: true, data: { reminders: rows } };
    },
  },

  // ─── daily_recap ─────────────────────────────────────────────────────────
  daily_recap: {
    definition: {
      name: "daily_recap",
      description:
        "Summarize what the texting user has personally shipped: contacts they created, " +
        "meetings they organized, touches they logged, reminders they filed for themselves " +
        "or others, plus auto-detected highlights (new 'connector' contacts, dual-source " +
        "priority signals where the same contact came in from multiple intro chains). " +
        "Use when the user asks for a recap, 'what did I do today', 'highlight my wins', " +
        "or any end-of-day/end-of-week reflection prompt.",
      input_schema: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["today", "yesterday", "week"],
            description:
              "Time window. Defaults to 'today' (since UTC midnight of the current calendar day).",
          },
        },
      },
    },
    async execute(input, ctx) {
      const scope = (input.scope as "today" | "yesterday" | "week") ?? "today";
      const now = ctx.now;
      let start: Date;
      let end: Date;
      if (scope === "yesterday") {
        const startOfToday = new Date(now);
        startOfToday.setUTCHours(0, 0, 0, 0);
        start = new Date(startOfToday.getTime() - 86400000);
        end = startOfToday;
      } else if (scope === "week") {
        start = new Date(now.getTime() - 7 * 86400000);
        end = now;
      } else {
        start = new Date(now);
        start.setUTCHours(0, 0, 0, 0);
        end = now;
      }

      // Contacts they created in window.
      const newContacts = await db
        .select({
          id: contacts.id,
          name: contacts.name,
          type: contacts.type,
          organization: contacts.organization,
          relationship: contacts.relationshipType,
          intro: contacts.introChainFromText,
          createdAt: contacts.createdAt,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.workspaceId, ctx.workspaceId),
            eq(contacts.createdBy, ctx.userId),
            gte(contacts.createdAt, start),
            lt(contacts.createdAt, end),
          ),
        )
        .orderBy(asc(contacts.createdAt));

      // For each new contact, attach their tag names (so the wrapper LLM can
      // point out which ones are 'connector' / dual-sourced).
      const tagByContact: Record<string, string[]> = {};
      if (newContacts.length > 0) {
        const ids = newContacts.map((c) => c.id);
        const tagRows = await db
          .select({
            contactId: contactTags.contactId,
            name: tags.name,
            kind: tags.kind,
          })
          .from(contactTags)
          .innerJoin(tags, eq(tags.id, contactTags.tagId))
          .where(inArray(contactTags.contactId, ids));
        for (const r of tagRows) {
          if (!tagByContact[r.contactId]) tagByContact[r.contactId] = [];
          tagByContact[r.contactId].push(r.name);
        }
      }

      const contactsWithTags = newContacts.map((c) => ({
        ...c,
        tags: tagByContact[c.id] ?? [],
      }));

      // Highlight #1 — new connectors (tag === 'connector').
      const connectors = contactsWithTags.filter((c) =>
        c.tags.includes("connector"),
      );

      // Highlight #2 — dual-source signals: a contact that carries 2+ `via-*`
      // tags is a name that surfaced through multiple intro chains.
      const dualSourced = contactsWithTags.filter(
        (c) => c.tags.filter((t) => t.startsWith("via-")).length >= 2,
      );

      // Meetings they organized (createdBy = user) in window.
      const newMeetings = await db
        .select({
          id: meetings.id,
          title: meetings.title,
          scheduledAt: meetings.scheduledAt,
        })
        .from(meetings)
        .where(
          and(
            eq(meetings.workspaceId, ctx.workspaceId),
            eq(meetings.createdBy, ctx.userId),
            gte(meetings.createdAt, start),
            lt(meetings.createdAt, end),
          ),
        )
        .orderBy(asc(meetings.scheduledAt));

      // Touches they authored (excludes auto-touches generated by meeting
      // creation only if we wanted to — we keep them all here for honesty).
      const newTouches = await db
        .select({
          id: touches.id,
          contactId: touches.contactId,
          channel: touches.channel,
          body: touches.body,
          createdAt: touches.createdAt,
        })
        .from(touches)
        .where(
          and(
            eq(touches.workspaceId, ctx.workspaceId),
            eq(touches.createdBy, ctx.userId),
            gte(touches.createdAt, start),
            lt(touches.createdAt, end),
          ),
        )
        .orderBy(asc(touches.createdAt))
        .limit(20);

      // Reminders the user filed (created_by = user). Separate from
      // reminders the user is receiving (for_user_id = user).
      const remindersFiled = await db
        .select({
          id: reminders.id,
          subject: reminders.subject,
          dueAt: reminders.dueAt,
          forUserId: reminders.forUserId,
        })
        .from(reminders)
        .where(
          and(
            eq(reminders.workspaceId, ctx.workspaceId),
            eq(reminders.createdBy, ctx.userId),
            gte(reminders.createdAt, start),
            lt(reminders.createdAt, end),
          ),
        );

      return {
        ok: true,
        data: {
          scope,
          window: {
            start: start.toISOString(),
            end: end.toISOString(),
            timezone: ctx.ownerTimezone,
          },
          totals: {
            contacts: contactsWithTags.length,
            meetings: newMeetings.length,
            touches: newTouches.length,
            remindersFiled: remindersFiled.length,
          },
          contacts: contactsWithTags.map((c) => ({
            name: c.name,
            type: c.type,
            organization: c.organization,
            relationship: c.relationship,
            tags: c.tags,
            intro_excerpt: c.intro?.slice(0, 200) ?? null,
          })),
          highlights: {
            connectors: connectors.map((c) => ({
              name: c.name,
              organization: c.organization,
              intro_excerpt: c.intro?.slice(0, 200) ?? null,
            })),
            dual_sourced_priority: dualSourced.map((c) => ({
              name: c.name,
              organization: c.organization,
              via_tags: c.tags.filter((t) => t.startsWith("via-")),
              intro_excerpt: c.intro?.slice(0, 200) ?? null,
            })),
          },
          meetings: newMeetings.map((m) => ({
            title: m.title,
            scheduledAt: m.scheduledAt,
          })),
          reminders_filed: remindersFiled.map((r) => ({
            subject: r.subject.slice(0, 140),
            dueAt: r.dueAt,
            forSelf: r.forUserId === ctx.userId,
          })),
        },
      };
    },
  },

  // ─── cancel_reminder ─────────────────────────────────────────────────────
  cancel_reminder: {
    definition: {
      name: "cancel_reminder",
      description:
        "Cancel one of your upcoming reminders by id. The id comes from list_reminders.",
      input_schema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
    async execute(input, ctx) {
      const id = safeStr(input.id);
      const [row] = await db
        .delete(reminders)
        .where(and(eq(reminders.id, id), eq(reminders.forUserId, ctx.userId)))
        .returning({ id: reminders.id, subject: reminders.subject });
      if (!row) return { ok: false, error: "Reminder not found" };
      return { ok: true, data: row, speak: `Cancelled "${row.subject}".` };
    },
  },
};

export const TOOL_DEFINITIONS: ClaudeToolDef[] = Object.values(TOOLS).map(
  (t) => t.definition,
);

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = TOOLS[name];
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  try {
    return await tool.execute(input, ctx);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export const TOOL_NAMES = Object.keys(TOOLS);
