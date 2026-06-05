import type { ClaudeToolDef } from "@/lib/anthropic";

export type ToolResult =
  | { ok: true; data: unknown; speak?: string }
  | { ok: false; error: string };

export type WorkspaceRole = "owner" | "admin" | "member";

/**
 * Per-invocation context handed to every tool. Stays small on purpose —
 * tools that need DB / Anthropic / etc. import them directly.
 */
export type ToolContext = {
  workspaceId: string;
  userId: string;
  ownerTimezone: string;
  workspaceRole: WorkspaceRole;
  now: Date;
  /**
   * Set when the inbound message originated from a transcribed voice note.
   * Action items created this turn link back to it for provenance.
   */
  sourceVoiceNoteId?: string | null;
};

export type ToolExecutor = (
  input: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<ToolResult>;

export type ToolEntry = {
  definition: ClaudeToolDef;
  execute: ToolExecutor;
};

export function safeStr(v: unknown, max = 1000): string {
  if (typeof v !== "string") return "";
  return v.slice(0, max).trim();
}
