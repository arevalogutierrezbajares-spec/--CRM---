/**
 * create_task — create one new project milestone/task.
 *
 * This tool complements find_task/edit_task for quick PM updates when a task
 * should exist immediately instead of being manually created in the UI.
 */

import { createTask as createTaskRecord } from "@/db/queries/items";
import { safeStr, type ToolEntry } from "./_types";

const PRIORITIES = ["now", "next", "later", "backlog"] as const;
type Priority = (typeof PRIORITIES)[number];

function cleanDueDate(raw: unknown): string | null {
  const v = safeStr(raw, 10);
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export const createTask: ToolEntry = {
  definition: {
    name: "create_task",
    description:
      "Create a new project task/milestone. Use this when you can identify the project and " +
      "need a new task to exist before execution starts. Only include the fields you know.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Task title. Keep to ~200 chars.",
        },
        project_id: {
          type: "string",
          description: "Project id that owns the task.",
        },
        due_date: {
          type: "string",
          description:
            "Optional due date as YYYY-MM-DD. Resolve relative dates to absolute first.",
        },
        priority: {
          type: "string",
          enum: [...PRIORITIES],
          description: "Optional priority label.",
        },
        assignee_user_id: {
          type: "string",
          description: "Optional assigned workspace member id.",
        },
        initiative_id: {
          type: "string",
          description: "Optional initiative id.",
        },
        sprint_id: {
          type: "string",
          description: "Optional sprint id.",
        },
      },
      required: ["title", "project_id"],
    },
  },

  async execute(input, ctx) {
    const title = safeStr(input.title, 200);
    if (!title) return { ok: false, error: "title is required" };

    const projectId = safeStr(input.project_id);
    if (!projectId) return { ok: false, error: "project_id is required" };

    const dueDate = input.due_date ? cleanDueDate(input.due_date) : null;
    if (input.due_date && !dueDate) {
      return { ok: false, error: "due_date must be YYYY-MM-DD." };
    }

    const rawPriority = safeStr(input.priority, 12);
    const priority = PRIORITIES.includes(rawPriority as Priority)
      ? (rawPriority as Priority)
      : null;

    try {
      const { id } = await createTaskRecord({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        title,
        projectId,
        dueDate,
        priority,
        assigneeUserId: safeStr(input.assignee_user_id) || null,
        initiativeId: safeStr(input.initiative_id) || null,
        sprintId: safeStr(input.sprint_id) || null,
      });

      return {
        ok: true,
        data: { id },
        speak: `Created task "${title}".`,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Project not found")) {
        return { ok: false, error: "Project not found in this workspace." };
      }
      return {
        ok: false,
        error: "Could not create task. Check project_id and required fields.",
      };
    }
  },
};
