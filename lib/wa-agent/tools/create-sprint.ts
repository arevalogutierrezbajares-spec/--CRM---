/**
 * create_sprint — create a new sprint row (optionally linked to an initiative).
 */

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const { sprints, initiatives } = schema;
const STATUSES = ["planned", "active", "completed"] as const;
type SprintStatus = (typeof STATUSES)[number];

function cleanDate(raw: unknown): string | undefined {
  const v = safeStr(raw, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

async function initiativeExistsInWorkspace(
  workspaceId: string,
  initiativeId: string,
): Promise<boolean> {
  if (!initiativeId) return false;
  const [row] = await db
    .select({ id: initiatives.id })
    .from(initiatives)
    .where(
      and(
        eq(initiatives.id, initiativeId),
        eq(initiatives.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export const createSprint: ToolEntry = {
  definition: {
    name: "create_sprint",
    description:
      "Create a sprint for this workspace. Use initiative_id to scope it to one initiative.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Sprint title." },
        goal: {
          type: "string",
          description: "What the sprint is trying to ship.",
        },
        start_date: {
          type: "string",
          description: "Sprint start YYYY-MM-DD. Required.",
        },
        end_date: {
          type: "string",
          description: "Sprint end YYYY-MM-DD. Required.",
        },
        initiative_id: {
          type: "string",
          description: "Optional initiative that owns this sprint.",
        },
        status: {
          type: "string",
          enum: [...STATUSES],
          description: "Default is planned.",
        },
      },
      required: ["name", "start_date", "end_date"],
    },
  },

  async execute(input, ctx) {
    const name = safeStr(input.name, 160);
    if (!name) return { ok: false, error: "name is required" };

    const startDate = cleanDate(input.start_date);
    const endDate = cleanDate(input.end_date);
    if (!startDate) return { ok: false, error: "start_date must be YYYY-MM-DD." };
    if (!endDate) return { ok: false, error: "end_date must be YYYY-MM-DD." };
    if (startDate > endDate) {
      return { ok: false, error: "start_date must be on or before end_date." };
    }

    const rawInitiativeId = safeStr(input.initiative_id);
    if (rawInitiativeId && !(await initiativeExistsInWorkspace(ctx.workspaceId, rawInitiativeId))) {
      return { ok: false, error: "initiative_id not found in this workspace." };
    }

    const rawStatus = safeStr(input.status, 16);
    const status = STATUSES.includes(rawStatus as SprintStatus)
      ? (rawStatus as SprintStatus)
      : "planned";

    if (status === "active") {
      await db
        .update(sprints)
        .set({ status: "planned" })
        .where(
          and(
            eq(sprints.workspaceId, ctx.workspaceId),
            eq(sprints.status, "active"),
          ),
        );
    }

    const [row] = await db
      .insert(sprints)
      .values({
        workspaceId: ctx.workspaceId,
        initiativeId: rawInitiativeId || null,
        name,
        goal: safeStr(input.goal, 3000) || null,
        startDate,
        endDate,
        status,
      })
      .returning({ id: sprints.id, name: sprints.name, status: sprints.status });

    return {
      ok: true,
      data: row,
      speak: `Created sprint ${row.name}.`,
    };
  },
};
