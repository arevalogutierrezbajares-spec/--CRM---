/**
 * log_meeting — create a meeting record + attendees + auto-touch each contact.
 */

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const { contacts, meetings, meetingAttendees, touches, reminders } = schema;

export const logMeeting: ToolEntry = {
  definition: {
    name: "log_meeting",
    description:
      "Log a meeting in the CRM. Creates the meeting, links all attendees, and " +
      "auto-logs a touch on each contact. Optionally schedules a follow-up reminder.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        scheduled_at: { type: "string", description: "ISO-8601 datetime of the meeting." },
        duration_minutes: { type: "number" },
        attendee_contact_ids: {
          type: "array",
          items: { type: "string" },
          description: "Contact UUIDs of everyone who attended.",
        },
        notes: { type: "string", description: "Meeting notes, summary, or key points." },
        project_id: { type: "string" },
        location: { type: "string" },
        meeting_type: {
          type: "string",
          enum: ["one_on_one", "group", "event", "call"],
        },
        follow_up_in: {
          type: "string",
          description: "Schedule a follow-up reminder, e.g. '2 weeks', 'next Monday', '3 days'.",
        },
      },
      required: ["title", "scheduled_at"],
    },
  },

  async execute(input, ctx) {
    const title = safeStr(input.title, 200);
    const scheduledAtRaw = safeStr(input.scheduled_at);
    const notes = safeStr(input.notes, 4000);
    const projectId = safeStr(input.project_id) || null;
    const location = safeStr(input.location, 200) || null;
    const meetingType = (safeStr(input.meeting_type) || "one_on_one") as
      | "one_on_one"
      | "group"
      | "event"
      | "call";
    const followUpIn = safeStr(input.follow_up_in) || null;

    if (!title) return { ok: false, error: "title is required" };
    if (!scheduledAtRaw) return { ok: false, error: "scheduled_at is required" };

    const scheduledAt = new Date(scheduledAtRaw);
    if (isNaN(scheduledAt.getTime()))
      return { ok: false, error: `Invalid datetime: ${scheduledAtRaw}` };

    const rawIds = Array.isArray(input.attendee_contact_ids) ? input.attendee_contact_ids : [];
    const attendeeIds = rawIds.map((id: unknown) => safeStr(id)).filter(Boolean).slice(0, 20);

    // Verify attendee contacts belong to workspace
    const ownedContacts =
      attendeeIds.length > 0
        ? await db
            .select({ id: contacts.id, name: contacts.name })
            .from(contacts)
            .where(eq(contacts.workspaceId, ctx.workspaceId))
        : [];
    const ownedMap = new Map(ownedContacts.map((c) => [c.id, c.name]));
    const validAttendeeIds = attendeeIds.filter((id) => ownedMap.has(id));

    // Compute endedAt from duration
    let endedAt: Date | null = null;
    if (typeof input.duration_minutes === "number" && input.duration_minutes > 0) {
      endedAt = new Date(scheduledAt.getTime() + input.duration_minutes * 60_000);
    }

    // Create the meeting
    const [meeting] = await db
      .insert(meetings)
      .values({
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        title,
        scheduledAt,
        endedAt,
        location,
        type: meetingType,
        minutes: notes || null,
        linkedProjectId: projectId as string | null,
        source: "whatsapp",
      })
      .returning({ id: meetings.id });

    // Attach attendees + auto-touch
    const touchedNames: string[] = [];
    if (validAttendeeIds.length > 0) {
      await db.insert(meetingAttendees).values(
        validAttendeeIds.map((contactId) => ({ meetingId: meeting.id, contactId })),
      );

      for (const contactId of validAttendeeIds) {
        const contactName = ownedMap.get(contactId) ?? contactId;
        const touchBody = notes
          ? `[Meeting: ${title}] ${notes.slice(0, 300)}`
          : `[Meeting: ${title}]`;
        await db.insert(touches).values({
          contactId,
          workspaceId: ctx.workspaceId,
          createdBy: ctx.userId,
          channel: "meeting",
          meetingId: meeting.id,
          body: touchBody,
        });
        await db
          .update(contacts)
          .set({ lastTouchAt: ctx.now, updatedAt: ctx.now })
          .where(eq(contacts.id, contactId));
        touchedNames.push(contactName);
      }
    }

    // Optional follow-up reminder
    let reminderId: string | null = null;
    if (followUpIn) {
      const dueAt = parseFollowUp(followUpIn, ctx.now);
      if (dueAt) {
        const [rem] = await db
          .insert(reminders)
          .values({
            workspaceId: ctx.workspaceId,
            forUserId: ctx.userId,
            createdBy: ctx.userId,
            subject: `Follow up on: ${title}`,
            dueAt,
            recur: "once",
          })
          .returning({ id: reminders.id });
        reminderId = rem.id;
      }
    }

    const parts = [
      `Meeting "${title}" logged`,
      touchedNames.length ? `— touched ${touchedNames.join(", ")}` : "",
      reminderId ? `— follow-up reminder set` : "",
    ]
      .filter(Boolean)
      .join(" ");

    return {
      ok: true,
      data: {
        meetingId: meeting.id,
        attendeesTouched: touchedNames,
        followUpReminderId: reminderId,
      },
      speak: parts + ".",
    };
  },
};

/** Parse "2 weeks", "3 days", "next Monday", "tomorrow" → Date */
function parseFollowUp(expr: string, now: Date): Date | null {
  const lower = expr.toLowerCase().trim();
  const d = new Date(now);

  const nDays = lower.match(/^(\d+)\s*day/);
  if (nDays) { d.setDate(d.getDate() + parseInt(nDays[1])); return d; }

  const nWeeks = lower.match(/^(\d+)\s*week/);
  if (nWeeks) { d.setDate(d.getDate() + parseInt(nWeeks[1]) * 7); return d; }

  const nMonths = lower.match(/^(\d+)\s*month/);
  if (nMonths) { d.setMonth(d.getMonth() + parseInt(nMonths[1])); return d; }

  if (lower.includes("tomorrow")) { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; }
  if (lower.includes("next week")) { d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d; }

  const dayNames = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const dayMatch = dayNames.findIndex((day) => lower.includes(day));
  if (dayMatch >= 0) {
    const todayDay = d.getDay();
    let diff = dayMatch - todayDay;
    if (diff <= 0) diff += 7;
    d.setDate(d.getDate() + diff);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  return null;
}
