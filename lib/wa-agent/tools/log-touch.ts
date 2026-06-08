import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const { contacts, touches, reminders } = schema;

/**
 * Parse a follow-up expression like "3 days", "tomorrow", "next Monday", "Friday"
 * into a concrete Date. Returns null if the expression is unrecognised.
 */
export function parseFollowUp(expr: string, now: Date): Date | null {
  const lower = expr.toLowerCase().trim();
  const d = new Date(now);

  const nDays = lower.match(/(\d+)\s*day/);
  if (nDays) {
    d.setDate(d.getDate() + parseInt(nDays[1]));
    d.setHours(9, 0, 0, 0);
    return d;
  }

  const nWeeks = lower.match(/(\d+)\s*week/);
  if (nWeeks) {
    d.setDate(d.getDate() + parseInt(nWeeks[1]) * 7);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  const nMonths = lower.match(/(\d+)\s*month/);
  if (nMonths) {
    d.setMonth(d.getMonth() + parseInt(nMonths[1]));
    d.setHours(9, 0, 0, 0);
    return d;
  }

  if (lower.includes("tomorrow")) {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  if (lower.includes("next week")) {
    d.setDate(d.getDate() + 7);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayMatch = dayNames.findIndex((day) => lower.includes(day));
  if (dayMatch >= 0) {
    const today = d.getDay();
    let delta = dayMatch - today;
    if (delta <= 0) delta += 7; // always forward
    d.setDate(d.getDate() + delta);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  return null;
}

export const logTouch: ToolEntry = {
  definition: {
    name: "log_touch",
    description:
      "Append a touch (interaction note) to a single contact. Bumps last_touch_at. " +
      "Channels: manual (default), email, whatsapp, call, meeting, voice_memo, obsidian. " +
      "Prefer upsert_note for note-taking on multiple contacts at once.",
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
        follow_up_in: {
          type: "string",
          description:
            "Optionally schedule a follow-up reminder, e.g. '3 days', 'tomorrow', 'next Monday'",
        },
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

    // Optional follow-up reminder
    let reminderId: string | null = null;
    const followUpExpr = safeStr(input.follow_up_in, 60);
    if (followUpExpr) {
      const dueAt = parseFollowUp(followUpExpr, ctx.now);
      if (dueAt) {
        const [rem] = await db
          .insert(reminders)
          .values({
            workspaceId: ctx.workspaceId,
            forUserId: ctx.userId,
            createdBy: ctx.userId,
            subject: `Follow up with ${c.name}`,
            dueAt,
            recur: "once",
            sourceContactId: contactId,
          })
          .returning({ id: reminders.id });
        reminderId = rem.id;
      }
    }

    return {
      ok: true,
      data: { id: row.id, contactName: c.name, reminderId },
      speak: `Logged touch on ${c.name}${reminderId ? " + follow-up reminder set" : ""}.`,
    };
  },
};
