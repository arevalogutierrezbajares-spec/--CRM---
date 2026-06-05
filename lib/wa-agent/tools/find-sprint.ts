/**
 * find_sprint — search sprint backlog by name fragment.
 */

import { and, desc, eq, ilike } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const { sprints, initiatives } = schema;

export const findSprint: ToolEntry = {
  definition: {
    name: "find_sprint",
    description:
      "Search sprints by title fragment. Returns up to 6 matches with dates + initiative context.",
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
        id: sprints.id,
        name: sprints.name,
        goal: sprints.goal,
        startDate: sprints.startDate,
        endDate: sprints.endDate,
        status: sprints.status,
        initiativeTitle: initiatives.title,
      })
      .from(sprints)
      .leftJoin(initiatives, eq(initiatives.id, sprints.initiativeId))
      .where(
        and(eq(sprints.workspaceId, ctx.workspaceId), ilike(sprints.name, `%${q}%`)),
      )
      .orderBy(desc(sprints.createdAt))
      .limit(6);

    return {
      ok: true,
      data: { matches: rows },
      speak:
        rows.length === 1
          ? `Found sprint ${rows[0].name}.`
          : rows.length > 1
            ? `Found ${rows.length} sprints matching "${q}".`
            : `No sprints matched "${q}".`,
    };
  },
};
