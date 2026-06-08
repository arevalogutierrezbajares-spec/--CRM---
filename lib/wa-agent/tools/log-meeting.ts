import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";
import { parseFollowUp } from "./log-touch";

const { contacts, touches, meetings, meetingAttendees, reminders } = schema;

export const logMeeting: ToolEntry = {
  definition: {
    name: "log_meeting",
    description:
      "Log a meeting that happened or is scheduled. Creates meeting record, " +
      "touches each attendee, and optionally schedules a follow-up reminder.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        scheduled_at: {
          type: "string",
          description: "ISO-8601 datetime when the meeting happened or is scheduled",
        },
        duration_minutes: { type: "integer" },
        attendee_contact_ids: {
          type: "array",
          items: { type: "string" },
          description: "IDs of contacts who attended",
        },
        notes: { type: "string" },
        project_id: { type: "string" },
        location: { type: "string" },
        meeting_type: {
          type: "string",
          enum: ["one_on_one", "group", "event", "call"],
        },
        follow_up_in: {
          type: "string",
          description: "Schedule a follow-up reminder, e.g. '1 week', 'tomorrow', 'next Monday'",
        },
      },
      required: ["title", "scheduled_at", "attendee_contact_ids"],
    },
  },
  async execute(input, ctx) {
    const title = safeStr(input.title, 240);
    const scheduledAtIso = safeStr(input.scheduled_at, 50);
    const notes = safeStr(input.notes, 4000);
    const projectId = safeStr(input.project_id) || null;
    const location = safeStr(input.location, 300) || null;
    const followUpExpr = safeStr(input.follow_up_in, 60);
    const attendeeIds = Array.isArray(input.attendee_contact_ids)
      ? (input.attendee_contact_ids as string[]).map((id) => safeStr(id)).filter(Boolean)
      : [];

    if (!title || !scheduledAtIso || !attendeeIds.length)
      return { ok: false, error: "title, scheduled_at, and attendee_contact_ids are required" };

    const scheduledAt = new Date(scheduledAtIso);
    if (Number.isNaN(scheduledAt.getTime()))
      return { ok: false, error: `Could not parse scheduled_at="${scheduledAtIso}"` };

    const endedAt =
      typeof input.duration_minutes === "number"
        ? new Date(scheduledAt.getTime() + (input.duration_minutes as number) * 60000)
        : null;

    const meetingType =
      (input.meeting_type as "one_on_one" | "group" | "event" | "call" | undefined) ??
      (attendeeIds.length > 1 ? "group" : "one_on_one");

    // Create meeting
    const [meeting] = await db
      .insert(meetings)
      .values({
        workspaceId: ctx.workspaceId,
        title,
        scheduledAt,
        endedAt: endedAt ?? undefined,
        location: location ?? undefined,
        type: meetingType,
        minutes: notes || undefined,
        linkedProjectId: projectId ?? undefined,
        source: "manual",
        createdBy: ctx.userId,
      })
      .returning({ id: meetings.id });

    // Resolve attendees and create meeting_attendees + touches
    const attendeeNames: string[] = [];
    for (const contactId of attendeeIds) {
      const [c] = await db
        .select({ id: contacts.id, name: contacts.name })
        .from(contacts)
        .where(
          and(eq(contacts.id, contactId), eq(contacts.workspaceId, ctx.workspaceId)),
        )
        .limit(1);
      if (!c) continue;

      await db
        .insert(meetingAttendees)
        .values({ meetingId: meeting.id, contactId })
        .onConflictDoNothing();

      await db.insert(touches).values({
        contactId,
        body: `Meeting: ${title}${notes ? ` — ${notes.slice(0, 200)}` : ""}`,
        channel: "meeting",
        lobId: projectId ?? undefined,
        meetingId: meeting.id,
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
      });

      await db
        .update(contacts)
        .set({ lastTouchAt: ctx.now, updatedAt: ctx.now })
        .where(eq(contacts.id, contactId));

      attendeeNames.push(c.name);
    }

    // Optional follow-up reminder
    let followUpReminderId: string | null = null;
    if (followUpExpr) {
      const dueAt = parseFollowUp(followUpExpr, ctx.now);
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
        followUpReminderId = rem.id;
      }
    }

    const names = attendeeNames.join(", ");
    return {
      ok: true,
      data: { meetingId: meeting.id, followUpReminderId },
      speak: `Meeting "${title}" logged — touched ${names}${followUpReminderId ? " — follow-up reminder set" : ""}.`,
    };
  },
};
