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
      "INSTRUCTION: The user wants to record a note. If a contact name is mentioned, call find_contact first to resolve the ID, then call upsert_note. Tag the note to the contact(s) mentioned.",
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
      "INSTRUCTION: Find the contact by name with find_contact before logging the touch. If no match, ask the user to confirm before creating.",
  },

  draft_send: {
    allowedTools: ["find_contact", "draft_message", "send_message"],
    requireConfirmation: true,
    supplement:
      "INSTRUCTION: Call find_contact to resolve the contact, then call draft_message to gather context. " +
      "Present the full drafted message to the user and wait for YES before calling send_message. " +
      "Never send without explicit confirmation.",
  },

  add_channel: {
    allowedTools: ["find_contact", "add_channel"],
    model: "claude-haiku-4-5",
    supplement:
      "INSTRUCTION: Call find_contact first if you need to resolve the contact ID. Then call add_channel with the validated value.",
  },

  log_meeting: {
    allowedTools: ["find_contact", "log_meeting"],
    supplement:
      "INSTRUCTION: Resolve all attendee names to contact IDs with find_contact before calling log_meeting. " +
      "Use the current datetime if no time is specified.",
  },

  meeting_brief: {
    allowedTools: ["find_contact", "meeting_brief"],
    requiredTools: ["meeting_brief"],
    model: "claude-haiku-4-5",
    supplement:
      "INSTRUCTION: Call find_contact to resolve contact IDs, then call meeting_brief. " +
      "Present the brief clearly organized by contact.",
  },

  assign_contact: {
    allowedTools: ["find_contact", "assign_contact"],
    model: "claude-haiku-4-5",
    supplement:
      "INSTRUCTION: Call find_contact to get the contact ID, then assign_contact. " +
      "Use 'me' as the assignee if the user wants to assign to themselves.",
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
