import { and, eq, ilike } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const { projects } = schema;

export const findProject: ToolEntry = {
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
};
