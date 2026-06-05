/**
 * find_initiative — search initiative backlog by title fragment.
 */

import { and, desc, eq, ilike } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const { initiatives, projects } = schema;

export const findInitiative: ToolEntry = {
  definition: {
    name: "find_initiative",
    description:
      "Search initiatives by title fragment. Returns up to 6 matches with status, " +
      "priority, project, and target end date.",
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
        id: initiatives.id,
        title: initiatives.title,
        summary: initiatives.summary,
        status: initiatives.status,
        priority: initiatives.priority,
        targetEndDate: initiatives.targetEndDate,
        projectTitle: projects.title,
      })
      .from(initiatives)
      .leftJoin(projects, eq(projects.id, initiatives.projectId))
      .where(
        and(
          eq(initiatives.workspaceId, ctx.workspaceId),
          ilike(initiatives.title, `%${q}%`),
        ),
      )
      .orderBy(desc(initiatives.updatedAt))
      .limit(6);

    return {
      ok: true,
      data: { matches: rows },
      speak:
        rows.length === 1
          ? `Found initiative ${rows[0].title}.`
          : rows.length > 1
            ? `Found ${rows.length} initiatives matching "${q}".`
            : `No initiatives matched "${q}".`,
    };
  },
};
