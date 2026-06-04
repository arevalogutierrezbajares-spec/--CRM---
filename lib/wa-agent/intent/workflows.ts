/**
 * Workflow registry: per-intent rules for tool gating and prompt injection.
 *
 * allowedTools — if set, only these tools may be called for this intent.
 *                Disallowed tool_use blocks get an error result injected.
 * requiredTools — if set, the loop forces a re-run if none of these tools
 *                 were called before the agent sends its final reply.
 * requireConfirmation — if true, the loop injects a supplement telling the
 *                       agent to preview and await confirmation rather than
 *                       executing immediately (on first turn with no pendingIntent).
 * supplement — appended to the system prompt for this intent.
 */

import type { Intent } from "./classify";

export type Workflow = {
  allowedTools?: string[]; // undefined = all tools allowed
  requiredTools?: string[]; // at least one of these must be called
  requireConfirmation?: boolean;
  supplement?: string;
  /**
   * Override the default model for this intent.
   *  - "claude-haiku-4-5" — cheap + fast, for deterministic tool routing
   *  - "claude-sonnet-4-6" — default, for ambiguous/creative work
   *  - "claude-opus-4-7" — overkill; reserved for milestone_done or research
   */
  model?: "claude-haiku-4-5" | "claude-sonnet-4-6" | "claude-opus-4-7";
};

export const WORKFLOWS: Partial<Record<Intent, Workflow>> = {
  recap: {
    allowedTools: ["daily_recap", "contact_summary", "find_contact"],
    requiredTools: ["daily_recap"],
    model: "claude-haiku-4-5",
    supplement:
      "INSTRUCTION: The user wants a team recap. You MUST call daily_recap before writing your reply. Do NOT summarize from memory or prior turns — call the tool now.",
  },

  note_write: {
    allowedTools: ["find_contact", "upsert_note", "create_contact"],
    supplement:
      "Record a note. Use any PRE-RESOLVED contact_ids directly; only call find_contact if a name is mentioned that wasn't pre-resolved.",
  },

  action_capture: {
    allowedTools: ["add_action_item"],
    model: "claude-sonnet-4-6",
    supplement:
      "The user is dictating tasks (often a transcribed voice note). Identify EACH distinct action item and call add_action_item once per item. " +
      "Keep titles short and imperative. Resolve relative dates ('tomorrow', 'Friday') to an absolute YYYY-MM-DD in the user's timezone for due_date. " +
      "If the message contains no actionable tasks, do not call the tool — just reply briefly. " +
      "After capturing, reply with a one-line confirmation listing what you saved.",
  },

  contact_add: {
    allowedTools: ["find_contact", "create_contact", "propose_add_contact"],
    requireConfirmation: true,
    supplement:
      "INSTRUCTION: Before creating a new contact, call find_contact to check for an existing match. If found, report the match. Only proceed to create if the user confirms there is no duplicate.",
  },

  contact_find: {
    allowedTools: ["find_contact", "contact_summary"],
    model: "claude-haiku-4-5",
    supplement:
      "INSTRUCTION: Use find_contact to look up the contact. If multiple matches, list them and ask the user which one.",
  },

  todo_query: {
    allowedTools: ["read_todo_board", "list_reminders", "status_report"],
    requiredTools: ["read_todo_board", "list_reminders", "status_report"],
    model: "claude-haiku-4-5",
    supplement:
      "INSTRUCTION: The user wants their action items. You MUST call read_todo_board (or at minimum list_reminders + status_report) to get live data. Do NOT list todos from memory or conversation history.",
  },

  update_item: {
    allowedTools: [
      "read_todo_board",
      "find_project",
      "edit_action_item",
      "edit_task",
    ],
    requiredTools: ["edit_action_item", "edit_task"],
    model: "claude-haiku-4-5",
    supplement:
      "INSTRUCTION: The user wants to CHANGE an existing action item or task (status, due date, " +
      "priority, assignee, or project) — not create one. " +
      "Decide whether it is a standalone action item (use edit_action_item) or a project " +
      "milestone/task (use edit_task). " +
      "To target the right item: if you don't already have its id from this conversation, pass a " +
      "title_query (a few words of the item's name) — the tool fuzzy-matches and, if several open " +
      "items match, returns the candidates so you can ask the user which one. Prefer passing an " +
      "explicit id when read_todo_board or find_project already surfaced it. " +
      "Resolve any relative date ('Friday', 'next week') to an absolute YYYY-MM-DD in the user's " +
      "timezone before calling. Only set the fields the user asked to change. " +
      "After editing, reply with a one-line confirmation of what changed. " +
      "To mark a milestone fully done, prefer the milestone_done flow (mark_milestone_done) which confirms first.",
  },

  reminder_set: {
    allowedTools: ["schedule_reminder", "find_contact"],
    supplement:
      "INSTRUCTION: Resolve the date/time to a full ISO-8601 datetime (with timezone offset) in the user's local timezone before calling schedule_reminder. Never use relative dates in the API call.",
  },

  reminder_list: {
    allowedTools: ["list_reminders"],
    requiredTools: ["list_reminders"],
    model: "claude-haiku-4-5",
    supplement:
      "INSTRUCTION: Call list_reminders to get the current reminders. Do not recite from memory.",
  },

  reminder_cancel: {
    allowedTools: ["list_reminders", "cancel_reminder"],
    requireConfirmation: true,
    model: "claude-haiku-4-5",
    supplement:
      "INSTRUCTION: First call list_reminders so the user sees their reminders. Then ask which one to cancel and confirm before calling cancel_reminder.",
  },

  touch_log: {
    allowedTools: ["find_contact", "log_touch", "create_contact"],
    supplement:
      "Log the touch. Use any PRE-RESOLVED contact_ids directly. If a name isn't pre-resolved, call find_contact. " +
      "If no match: propose creating with sensible defaults (relationship_type='prospect', organization from context if mentioned) and ask ONE concise YES/NO — do not interrogate the user for every field.",
  },

  draft_send: {
    allowedTools: ["find_contact", "draft_message", "send_message"],
    requireConfirmation: true,
    supplement:
      "Use any PRE-RESOLVED contact_id directly, then call draft_message. Show the full drafted message and wait for YES before send_message. Never send without explicit confirmation.",
  },

  add_channel: {
    allowedTools: ["find_contact", "add_channel"],
    model: "claude-haiku-4-5",
    supplement:
      "Use PRE-RESOLVED contact_id directly; only call find_contact if no match was pre-resolved. Then add_channel with the validated value.",
  },

  log_meeting: {
    allowedTools: ["find_contact", "log_meeting"],
    supplement:
      "Use PRE-RESOLVED contact_ids directly for attendees; only call find_contact for unresolved names. Use the current datetime if none specified.",
  },

  meeting_brief: {
    allowedTools: ["find_contact", "meeting_brief"],
    requiredTools: ["meeting_brief"],
    model: "claude-haiku-4-5",
    supplement:
      "Use PRE-RESOLVED contact_ids directly; only call find_contact for unresolved names. Then meeting_brief.",
  },

  assign_contact: {
    allowedTools: ["find_contact", "assign_contact"],
    model: "claude-haiku-4-5",
    supplement:
      "Use PRE-RESOLVED contact_id directly. 'me' as assignee means the texter themselves.",
  },

  status_check: {
    allowedTools: ["status_report", "find_project", "contact_summary"],
    requiredTools: ["status_report", "find_project"],
    model: "claude-haiku-4-5",
    supplement:
      "INSTRUCTION: Pull live project/milestone status with status_report or find_project. Do not recite from prior context.",
  },

  milestone_done: {
    allowedTools: ["find_project", "mark_milestone_done"],
    requireConfirmation: true,
    supplement:
      "INSTRUCTION: Marking a milestone done is irreversible. Call find_project first, show the exact milestone name and project, and ask the user to confirm (YES/NO) before calling mark_milestone_done.",
  },

  confirmation: {
    // Handled by pendingIntent logic in the loop — no tool restrictions needed
  },

  unknown: {
    // Fall back to a tiny read-only toolset so greetings ("hi", "thanks") and
    // misclassified messages don't ship all 20 tool definitions every call.
    // Users with truly novel requests can rephrase to land on a real intent.
    allowedTools: ["find_contact", "contact_summary", "find_project"],
    model: "claude-haiku-4-5",
  },
};

/** Returns the workflow for a given intent, falling back to an unrestricted one. */
export function getWorkflow(intent: Intent): Workflow {
  return WORKFLOWS[intent] ?? {};
}
