// Back-compat re-export — the real implementations live in lib/wa-agent/tools/.
// Keep this file thin so existing imports (tests, scripts) don't break.
export {
  TOOLS,
  TOOL_NAMES,
  TOOL_DEFINITIONS,
  executeTool,
  type ToolContext,
  type ToolEntry,
  type ToolResult,
} from "@/lib/wa-agent/tools";
