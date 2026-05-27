import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ToolEntry } from "./_types";

const { reminders } = schema;

export const listReminders: ToolEntry = {
  definition: {
    name: "list_reminders",
    description:
      "Return your upcoming reminders. Default scope is the next 7 days. " +
      "For the full action-item view (reminders + assigned milestones + computed signals), " +
      "use read_todo_board instead.",
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
};
