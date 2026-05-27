import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const { reminders } = schema;

export const cancelReminder: ToolEntry = {
  definition: {
    name: "cancel_reminder",
    description:
      "Cancel one of your upcoming reminders by id. The id comes from list_reminders " +
      "or read_todo_board.",
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
};
