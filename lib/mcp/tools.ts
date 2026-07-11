import { TOOLS, executeTool, type ToolContext, type ToolResult } from "@/lib/wa-agent/tools";
import type { ClaudeToolDef } from "@/lib/anthropic";

/**
 * Curated subset of the WhatsApp agent's tool registry exposed over MCP. The
 * full registry includes WhatsApp-only side-effect tools (send_message,
 * draft_message, post_to_townhall, etc.) that don't belong in a Claude Code
 * surface — this allowlist keeps the MCP to reading context, uploading info,
 * and managing partner rooms end-to-end (create → fill → brand → share link).
 *
 * Note: registry tools also reach the ÑIGO web-chat loop (fullTools), which
 * has no forced confirmation gate — irreversible operations must gate
 * themselves (see update_partner_room's confirm_revoke).
 *
 * Adding a tool to Claude Code is a one-line edit here, as long as it already
 * exists in lib/wa-agent/tools/index.ts.
 */
export const MCP_TOOL_NAMES = [
  // Read / context
  "find_contact",
  "contact_summary",
  "find_project",
  "find_member",
  "status_report",
  "daily_recap",
  "read_todo_board",
  "meeting_brief",
  "list_reminders",
  // Write / upload
  "create_contact",
  "log_touch",
  "log_meeting",
  "add_action_item",
  "edit_action_item",
  "attach_link",
  "upsert_note",
  "mark_milestone_done",
  "assign_contact",
  "schedule_reminder",
  "file_enhancement",
  // Partner rooms — set up, fill, and share partner microsites end-to-end
  "create_partner_room",
  "partner_room_overview",
  "add_room_documents",
  "add_room_link",
  "update_partner_room",
  "set_room_branding",
  "add_room_next_step",
  "get_partner_room_link",
  // Demos — feature a product demo as a "Demo access" card in a room
  "list_demos",
  "feature_room_demo",
] as const;

const ALLOWED = new Set<string>(MCP_TOOL_NAMES);

/** Tool definitions in MCP shape: { name, description, inputSchema }. */
export const MCP_TOOL_DEFINITIONS = MCP_TOOL_NAMES.filter((n) => TOOLS[n]).map((name) => {
  const def: ClaudeToolDef = TOOLS[name].definition;
  return {
    name: def.name,
    description: def.description,
    inputSchema: def.input_schema,
  };
});

/** Run an allowlisted tool; rejects anything not exposed to the MCP. */
export async function executeMcpTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  if (!ALLOWED.has(name)) {
    return { ok: false, error: `Unknown or unavailable tool: ${name}` };
  }
  return executeTool(name, input, ctx);
}
