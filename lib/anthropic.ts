/**
 * Thin Anthropic client. Activates with ANTHROPIC_API_KEY. Returns a 503-shaped
 * error result when missing so callers can degrade gracefully.
 *
 * Default model: claude-opus-4-7 (latest as of project knowledge cutoff).
 */

export type ClaudeResult =
  | { ok: true; text: string }
  | { ok: false; error: string; status?: number };

export type ClaudeUsage = { input_tokens: number; output_tokens: number };

/**
 * Tool-use message returned by the Messages API. Either Claude finished
 * (text) or wants to call a tool (tool_use). Multi-turn loops use this.
 */
export type ClaudeToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};
export type ClaudeTextBlock = { type: "text"; text: string };
export type ClaudeContentBlock = ClaudeToolUseBlock | ClaudeTextBlock;

export type ClaudeToolResult =
  | {
      ok: true;
      stopReason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
      content: ClaudeContentBlock[];
      usage: ClaudeUsage;
    }
  | { ok: false; error: string; status?: number };

export type ClaudeToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

/**
 * Single message in the tool-use loop. Mirrors Anthropic's schema.
 *   user → text input from the user OR a `tool_result` block
 *   assistant → text reply OR `tool_use` blocks
 */
export type ClaudeMessage =
  | { role: "user"; content: string | ClaudeMessageContent[] }
  | { role: "assistant"; content: string | ClaudeMessageContent[] };

export type ClaudeMessageContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    };

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Tool-use Messages API call. Returns the full response so the caller can
 * inspect tool_use blocks + decide whether to loop.
 */
export async function claudeWithTools(opts: {
  system: string;
  messages: ClaudeMessage[];
  tools: ClaudeToolDef[];
  model?: string;
  maxTokens?: number;
}): Promise<ClaudeToolResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY not set" };
  // Default to Sonnet 4.6 — cheaper, plenty smart for tool routing.
  const model = opts.model ?? "claude-sonnet-4-6";
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      tools: opts.tools,
      messages: opts.messages,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    return {
      ok: false,
      error: body || `HTTP ${resp.status}`,
      status: resp.status,
    };
  }
  const json = (await resp.json()) as {
    stop_reason: ClaudeToolResult extends { ok: true; stopReason: infer S } ? S : never;
    content: ClaudeContentBlock[];
    usage: ClaudeUsage;
  };
  return {
    ok: true,
    stopReason: json.stop_reason,
    content: json.content,
    usage: json.usage,
  };
}

export async function claudeChat(opts: {
  system?: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}): Promise<ClaudeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY not set" };
  const model = opts.model ?? "claude-opus-4-7";

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    return { ok: false, error: body || `HTTP ${resp.status}`, status: resp.status };
  }
  const json = (await resp.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text =
    json.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n") ?? "";
  return { ok: true, text };
}
