/**
 * Tool registry. Adding a new tool is a single line below + a new file in this
 * folder. The agent loop introspects TOOLS to compute TOOL_DEFINITIONS (sent to
 * Claude) and to resolve tool names → executors at call time.
 */
import type { ClaudeToolDef } from "@/lib/anthropic";
import type { ToolContext, ToolEntry, ToolResult } from "./_types";

import { findContact } from "./find-contact";
import { createContact } from "./create-contact";
import { logTouch } from "./log-touch";
import { contactSummary } from "./contact-summary";
import { findProject } from "./find-project";
import { markMilestoneDone } from "./mark-milestone-done";
import { statusReport } from "./status-report";
import { scheduleReminder } from "./schedule-reminder";
import { listReminders } from "./list-reminders";
import { cancelReminder } from "./cancel-reminder";
import { dailyRecap } from "./daily-recap";

export const TOOLS: Record<string, ToolEntry> = {
  find_contact: findContact,
  create_contact: createContact,
  log_touch: logTouch,
  contact_summary: contactSummary,
  find_project: findProject,
  mark_milestone_done: markMilestoneDone,
  status_report: statusReport,
  schedule_reminder: scheduleReminder,
  list_reminders: listReminders,
  cancel_reminder: cancelReminder,
  daily_recap: dailyRecap,
};

export const TOOL_NAMES = Object.keys(TOOLS);

export const TOOL_DEFINITIONS: ClaudeToolDef[] = Object.values(TOOLS).map(
  (t) => t.definition,
);

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = TOOLS[name];
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  try {
    return await tool.execute(input, ctx);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export type { ToolContext, ToolEntry, ToolResult } from "./_types";
