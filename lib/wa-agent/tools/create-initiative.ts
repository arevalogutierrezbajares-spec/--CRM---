/**
 * create_initiative — create a new initiative row in the workspace.
 */

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";
import { projectExistsInWorkspace } from "@/db/queries/items";

const { initiatives, workspaceMembers } = schema;

const PRIORITIES = ["now", "next", "later", "backlog"] as const;
type Priority = (typeof PRIORITIES)[number];
const STATUSES = ["planning", "active", "paused", "done", "cancelled"] as const;
type InitiativeStatus = (typeof STATUSES)[number];

function cleanDate(raw: unknown): string | undefined {
  const v = safeStr(raw, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

async function memberInWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export const createInitiative: ToolEntry = {
  definition: {
    name: "create_initiative",
    description:
      "Create a new initiative in this workspace. Optionally link it to a project and set its owner.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "The initiative title." },
        summary: {
          type: "string",
          description: "Short rationale / context for the initiative.",
        },
        goal: {
          type: "string",
          description: "The initiative objective/goal statement.",
        },
        project_id: {
          type: "string",
          description: "Optional workspace project id this initiative belongs to.",
        },
        owner_user_id: {
          type: "string",
          description: "Optional owner member id (must be this workspace member).",
        },
        priority: { type: "string", enum: [...PRIORITIES] },
        status: { type: "string", enum: [...STATUSES] },
        start_date: { type: "string", description: "YYYY-MM-DD" },
        target_end_date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["title"],
    },
  },

  async execute(input, ctx) {
    const title = safeStr(input.title, 200);
    if (!title) return { ok: false, error: "title is required" };

    const summary = safeStr(input.summary, 3000) || null;
    const goal = safeStr(input.goal, 3000) || null;

    const rawProjectId = safeStr(input.project_id);
    if (rawProjectId && !(await projectExistsInWorkspace(ctx.workspaceId, rawProjectId))) {
      return { ok: false, error: "Project not found in this workspace." };
    }

    const rawOwnerId = safeStr(input.owner_user_id);
    const ownerUserId =
      rawOwnerId && (await memberInWorkspace(ctx.workspaceId, rawOwnerId))
        ? rawOwnerId
        : null;

    const rawPriority = safeStr(input.priority, 16);
    const priority = PRIORITIES.includes(rawPriority as Priority)
      ? (rawPriority as Priority)
      : "next";

    const rawStatus = safeStr(input.status, 20);
    const status = STATUSES.includes(rawStatus as InitiativeStatus)
      ? (rawStatus as InitiativeStatus)
      : "planning";

    const startDate = cleanDate(input.start_date);
    const targetEndDate = cleanDate(input.target_end_date);

    if (input.start_date && !startDate) {
      return { ok: false, error: "start_date must be YYYY-MM-DD." };
    }
    if (input.target_end_date && !targetEndDate) {
      return { ok: false, error: "target_end_date must be YYYY-MM-DD." };
    }

    const [row] = await db
      .insert(initiatives)
      .values({
        workspaceId: ctx.workspaceId,
        projectId: rawProjectId || null,
        title,
        summary,
        goal,
        status,
        priority,
        ownerUserId,
        startDate,
        targetEndDate,
        createdBy: ctx.userId,
      })
      .returning({ id: initiatives.id, title: initiatives.title });

    return {
      ok: true,
      data: row,
      speak: `Created initiative ${row.title}.`,
    };
  },
};
