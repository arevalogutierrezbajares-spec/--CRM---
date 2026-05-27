import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const { milestones } = schema;

export const markMilestoneDone: ToolEntry = {
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
        and(eq(milestones.id, id), eq(milestones.workspaceId, ctx.workspaceId)),
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
};
