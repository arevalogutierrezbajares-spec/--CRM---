// Back-compat re-export — the real implementation lives in lib/wa-agent.
// Keep this file thin so existing imports (webhook route, tests, scripts)
// don't break while we migrate call sites.
export {
  handleMessage,
  resolveSender,
  type AgentResult,
  type ConversationState,
  type ResolvedSender,
} from "@/lib/wa-agent";
