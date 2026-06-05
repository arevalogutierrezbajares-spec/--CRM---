/**
 * edit_task — update an existing task (a project milestone): status, due date,
 * priority, (re)assignee, project, initiative, or title.
 *
 * Target resolution mirrors mark_milestone_done: pass `task_id` when known
 * (e.g. from read_todo_board / find_project), otherwise pass `title_query` to
 * fuzzy-match open milestones. On a single match it edits; on multiple it
 * returns the candidates (with their project) so the agent can disambiguate.
 *
 * For the irreversible "done" transition prefer mark_milestone_done (which the
 * milestone_done workflow gates behind a confirmation); this tool exists for
 * the full range of reschedule / reprioritize / reassign edits.
 */

import { findTasks, updateTask } from "@/db/queries/items";
import { safeStr, type ToolEntry } from "./_types";

const PRIORITIES = ["now", "next", "later", "backlog"] as const;
type Priority = (typeof PRIORITIES)[number];
const STATUSES = [
  "pending",
  "in_progress",
  "in_review",
  "blocked",
  "done",
  "cancelled",
] as const;
type Status = (typeof STATUSES)[number];

function cleanDueDate(raw: string): string | undefined {
  const v = safeStr(raw, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

export const editTask: ToolEntry = {
  definition: {
    name: "edit_task",
    description:
      "Update an EXISTING task (a project milestone): change status, due date, " +
      "priority, reassign it, move it to another project/initiative, or fix the title. " +
      "Identify the target with task_id (from read_todo_board or find_project) OR " +
      "with title_query (a few words of the title) — never both. " +
      "Only include the fields you want to change. " +
      "For marking a task done, prefer mark_milestone_done (it confirms first).",
    input_schema: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "The milestone id to edit. Prefer this when known.",
        },
        title_query: {
          type: "string",
          description:
            "Fuzzy title to locate the task when no id is known. " +
            "If multiple open tasks match, the tool returns candidates to disambiguate.",
        },
        title: { type: "string", description: "New title. Max 200 chars." },
        status: {
          type: "string",
          enum: [...STATUSES],
          description:
            "New status (pending / in_progress / in_review / blocked / done / cancelled).",
        },
        due_date: {
          type: "string",
          description:
            "New due date as YYYY-MM-DD. Resolve relative dates first. Empty string clears it.",
        },
        priority: {
          type: "string",
          enum: [...PRIORITIES],
          description: "New priority.",
        },
        assignee_user_id: {
          type: "string",
          description:
            "Reassign to this workspace user id. Empty string unassigns.",
        },
        project_id: {
          type: "string",
          description: "Move the task to this project (id from find_project).",
        },
        initiative_id: {
          type: "string",
          description: "Attach to this initiative. Empty string detaches.",
        },
        sprint_id: {
          type: "string",
          description: "Attach to this sprint. Empty string detaches.",
        },
      },
    },
  },

  async execute(input, ctx) {
    const id = safeStr(input.task_id);
    const titleQuery = safeStr(input.title_query, 200);

    // ── Resolve target ──────────────────────────────────────────────────
    let targetId = id;
    if (!targetId) {
      if (!titleQuery) {
        return { ok: false, error: "Provide either task_id or title_query." };
      }
      const matches = await findTasks({
        workspaceId: ctx.workspaceId,
        query: titleQuery,
        limit: 6,
      });
      if (matches.length === 0) {
        return { ok: false, error: `No open task matches "${titleQuery}".` };
      }
      if (matches.length > 1) {
        return {
          ok: true,
          data: { ambiguous: true, candidates: matches },
          speak:
            `Several tasks match "${titleQuery}": ` +
            matches.map((m) => `"${m.title}" (${m.projectTitle})`).join(", ") +
            ". Which one?",
        };
      }
      targetId = matches[0].id;
    }

    // ── Build the patch (only provided fields) ──────────────────────────
    const patch: Parameters<typeof updateTask>[0] = {
      workspaceId: ctx.workspaceId,
      id: targetId,
    };
    const changed: string[] = [];

    if (typeof input.title === "string") {
      const t = safeStr(input.title, 200);
      if (t) {
        patch.title = t;
        changed.push("title");
      }
    }
    if (typeof input.status === "string") {
      const s = safeStr(input.status, 16) as Status;
      if (STATUSES.includes(s)) {
        patch.status = s;
        changed.push(`status→${s}`);
      }
    }
    if (typeof input.due_date === "string") {
      if (input.due_date.trim() === "") {
        patch.dueDate = null;
        changed.push("due cleared");
      } else {
        const d = cleanDueDate(input.due_date);
        if (d) {
          patch.dueDate = d;
          changed.push(`due ${d}`);
        }
      }
    }
    if (typeof input.priority === "string") {
      const p = safeStr(input.priority, 12) as Priority;
      if (PRIORITIES.includes(p)) {
        patch.priority = p;
        changed.push(`priority ${p}`);
      }
    }
    if (typeof input.assignee_user_id === "string") {
      patch.assigneeUserId =
        input.assignee_user_id.trim() === ""
          ? null
          : safeStr(input.assignee_user_id);
      changed.push(
        input.assignee_user_id.trim() === "" ? "unassigned" : "reassigned",
      );
    }
    if (typeof input.project_id === "string") {
      const pid = safeStr(input.project_id);
      if (pid) {
        patch.projectId = pid;
        changed.push("moved project");
      }
    }
    if (typeof input.initiative_id === "string") {
      patch.initiativeId =
        input.initiative_id.trim() === ""
          ? null
          : safeStr(input.initiative_id);
      changed.push(
        input.initiative_id.trim() === "" ? "detached initiative" : "initiative",
      );
    }
    if (typeof input.sprint_id === "string") {
      patch.sprintId =
        input.sprint_id.trim() === ""
          ? null
          : safeStr(input.sprint_id);
      changed.push(
        input.sprint_id.trim() === "" ? "detached sprint" : "sprint",
      );
    }

    if (changed.length === 0) {
      return { ok: false, error: "No valid fields to update were provided." };
    }

    const row = await updateTask(patch);
    if (!row) return { ok: false, error: "Task not found." };

    return {
      ok: true,
      data: { id: row.id, title: row.title, changed },
      speak: `Updated task "${row.title}" (${changed.join(", ")}).`,
    };
  },
};
