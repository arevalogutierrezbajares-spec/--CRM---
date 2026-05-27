import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const { reminders } = schema;

export const scheduleReminder: ToolEntry = {
  definition: {
    name: "schedule_reminder",
    description:
      "Schedule a reminder for the texting user. Pass a fully-resolved ISO datetime in " +
      "due_at_iso. Recur defaults to 'once'. For weekly recur, set recur_day=0..6 (0=Sun). " +
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
};
