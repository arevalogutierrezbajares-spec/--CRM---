/**
 * Public surface of the WhatsApp agent module.
 *
 * Consumers should import from `@/lib/wa-agent` rather than the inner files:
 *   import { handleMessage, resolveSender } from "@/lib/wa-agent";
 *
 * Existing call sites that still import from `@/lib/whatsapp-agent` keep
 * working via the back-compat re-export in that file.
 */
export {
  handleMessage,
  resolveSender,
  type AgentResult,
  type ConversationState,
  type ResolvedSender,
} from "./loop";

export {
  TOOLS,
  TOOL_NAMES,
  TOOL_DEFINITIONS,
  executeTool,
  type ToolContext,
  type ToolEntry,
  type ToolResult,
} from "./tools";
