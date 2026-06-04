/**
 * edit_action_item — update an existing action item (status / due date /
 * priority / project / title).
 *
 * Target resolution mirrors mark_milestone_done: pass an `action_item_id` when
 * you have one (e.g. from read_todo_board). If the user only referred to the
 * item by name, pass `title_query` instead — the tool fuzzy-matches open action
 * items. On a single match it edits; on multiple it returns the candidates so
 * the agent can ask which one. USE THESE — do not re-implement DB writes.
 */

import { findActionItems, updateActionItem } from "@/db/queries/items";
import { safeStr, type ToolEntry } from "./_types";

const PRIORITIES = ["now", "next", "later", "backlog"] as const;
type Priority = (typeof PRIORITIES)[number];
const STATUSES = ["open", "done"] as const;
type Status = (typeof STATUSES)[number];

/** Accept only a clean YYYY-MM-DD; anything else → undefined (no guessing). */
function cleanDueDate(raw: string): string | undefined {
  const v = safeStr(raw, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

export const editActionItem: ToolEntry = {
  definition: {
    name: "edit_action_item",
    description:
      "Update an EXISTING action item: change its status (open/done), due date, " +
      "priority, attach it to a project, or fix the title. " +
      "Identify the target with action_item_id (from read_todo_board) OR with " +
      "title_query (a few words of the item's title) — never both. " +
      "Only include the fields you want to change.",
    input_schema: {
      type: "object",
      properties: {
        action_item_id: {
          type: "string",
          description:
            "The id of the action item to edit. Prefer this when known.",
        },
        title_query: {
          type: "string",
          description:
            "Fuzzy title to locate the item when no id is known (e.g. 'call the bank'). " +
            "If multiple open items match, the tool returns the candidates to disambiguate.",
        },
        title: { type: "string", description: "New title. Max 200 chars." },
        status: {
          type: "string",
          enum: [...STATUSES],
          description: "Mark the item 'done' or reopen it to 'open'.",
        },
        due_date: {
          type: "string",
          description:
            "New due date as YYYY-MM-DD. Resolve relative dates first. Use empty string to clear.",
        },
        priority: {
          type: "string",
          enum: [...PRIORITIES],
          description: "New priority/urgency.",
        },
        project_id: {
          type: "string",
          description:
            "Attach to this project (id from find_project). Use empty string to detach.",
        },
        assignee_user_id: {
          type: "string",
          description:
            "Assign to this teammate (id from find_member). Use empty string to unassign.",
        },
      },
    },
  },

  async execute(input, ctx) {
    const id = safeStr(input.action_item_id);
    const titleQuery = safeStr(input.title_query, 200);

    // ── Resolve target ──────────────────────────────────────────────────
    let targetId = id;
    if (!targetId) {
      if (!titleQuery) {
        return {
          ok: false,
          error: "Provide either action_item_id or title_query.",
        };
      }
      const matches = await findActionItems({
        workspaceId: ctx.workspaceId,
        query: titleQuery,
        limit: 6,
      });
      if (matches.length === 0) {
        return {
          ok: false,
          error: `No open action item matches "${titleQuery}".`,
        };
      }
      if (matches.length > 1) {
        return {
          ok: true,
          data: { ambiguous: true, candidates: matches },
          speak:
            `Several items match "${titleQuery}": ` +
            matches.map((m) => `"${m.title}"`).join(", ") +
            ". Which one?",
        };
      }
      targetId = matches[0].id;
    }

    // ── Build the patch (only provided fields) ──────────────────────────
    const patch: Parameters<typeof updateActionItem>[0] = {
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
      const s = safeStr(input.status, 8) as Status;
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
    if (typeof input.project_id === "string") {
      patch.projectId = input.project_id.trim() === "" ? null : safeStr(input.project_id);
      changed.push(input.project_id.trim() === "" ? "detached project" : "project");
    }
    if (typeof input.assignee_user_id === "string") {
      patch.assigneeUserId =
        input.assignee_user_id.trim() === "" ? null : safeStr(input.assignee_user_id);
      changed.push(input.assignee_user_id.trim() === "" ? "unassigned" : "reassigned");
    }

    if (changed.length === 0) {
      return { ok: false, error: "No valid fields to update were provided." };
    }

    const row = await updateActionItem(patch);
    if (!row) return { ok: false, error: "Action item not found." };

    return {
      ok: true,
      data: { id: row.id, title: row.title, changed },
      speak: `Updated "${row.title}" (${changed.join(", ")}).`,
    };
  },
};
