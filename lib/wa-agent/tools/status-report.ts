import { and, eq, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ToolEntry } from "./_types";

const { contacts, projects, milestones } = schema;

export const statusReport: ToolEntry = {
  definition: {
    name: "status_report",
    description:
      "Return the same data the This-Week page shows: counts of overdue " +
      "milestones, blocked projects, and stale friends (no touch in 60+ days).",
    input_schema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["all", "overdue", "blocked", "stale"],
          description: "Limit the report to one category. Defaults to 'all'.",
        },
      },
    },
  },
  async execute(input, ctx) {
    const scope = (input.scope as string) ?? "all";
    const today = ctx.now.toISOString().slice(0, 10);

    const result: Record<string, unknown> = {};
    if (scope === "all" || scope === "overdue") {
      const overdue = await db
        .select({
          id: milestones.id,
          title: milestones.title,
          projectId: milestones.projectId,
          dueDate: milestones.dueDate,
        })
        .from(milestones)
        .innerJoin(projects, eq(projects.id, milestones.projectId))
        .where(
          and(
            eq(projects.workspaceId, ctx.workspaceId),
            sql`${milestones.status} <> 'done'`,
            sql`${milestones.dueDate} IS NOT NULL`,
            lt(milestones.dueDate, today),
          ),
        )
        .limit(10);
      result.overdue = overdue;
    }
    if (scope === "all" || scope === "blocked") {
      const blocked = await db
        .select({
          id: projects.id,
          title: projects.title,
          waitingOn: projects.waitingOn,
        })
        .from(projects)
        .where(
          and(
            eq(projects.workspaceId, ctx.workspaceId),
            eq(projects.status, "waiting"),
          ),
        )
        .limit(10);
      result.blocked = blocked;
    }
    if (scope === "all" || scope === "stale") {
      const threshold = new Date(ctx.now.getTime() - 60 * 86400000);
      const stale = await db
        .select({
          id: contacts.id,
          name: contacts.name,
          lastTouchAt: contacts.lastTouchAt,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.workspaceId, ctx.workspaceId),
            eq(contacts.archived, false),
            eq(contacts.relationshipType, "friend"),
            or(
              sql`${contacts.lastTouchAt} IS NULL`,
              lt(contacts.lastTouchAt, threshold),
            ),
          ),
        )
        .limit(10);
      result.stale = stale;
    }
    return { ok: true, data: result };
  },
};
