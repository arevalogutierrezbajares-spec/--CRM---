import {
  type AnthropicModel,
  type AnthropicUsage,
  budgetExceededMessage,
  defaultAnthropicModel,
  estimateAnthropicMillicents,
  estimatedTokensForAnthropicRequest,
  getAnthropicSpendToday,
  anthropicBudgetResult,
  logAnthropicSpend,
} from "@/lib/anthropic-budget";

/**
 * Thin Anthropic client. Activates with ANTHROPIC_API_KEY. Returns a 503-shaped
 * error result when missing so callers can degrade gracefully.
 *
 * Default model: haiku (via ANTHROPIC_DEFAULT_MODEL / defaultAnthropicModel()).
 * Pass `model` to override (e.g. "claude-sonnet-4-6" for complex tool calls).
 */

export type AnthropicSpendContext = {
  workspaceId?: string | null;
  userId?: string | null;
  senderPhone?: string | null;
  direction?: "in" | "out" | "tool" | "reject" | "error";
  payload?: Record<string, unknown>;
  trackUsage?: boolean;
};

export type ClaudeResult =
  | { ok: true; text: string; usage: AnthropicUsage }
  | { ok: false; error: string; status?: number };

export type ClaudeUsage = AnthropicUsage;

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
      costMillicents: number;
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

type AnthropicApiResponse = {
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
  content: ClaudeContentBlock[];
  usage?: ClaudeUsage;
};

type AnthropicTextResponse = {
  content?: Array<{ type: string; text?: string }>;
  usage?: ClaudeUsage;
};

function coerceModel(value?: string): AnthropicModel {
  if (
    value === "claude-haiku-4-5" ||
    value === "claude-sonnet-4-6" ||
    value === "claude-opus-4-7"
  ) {
    return value;
  }
  return defaultAnthropicModel();
}

function withPayload(value?: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function maybeRejectOnBudget(
  model: AnthropicModel,
  spend: AnthropicSpendContext | undefined,
  prediction: { inputTokens: number; outputTokens: number },
) {
  if (process.env.ANTHROPIC_DISABLE_BUDGET === "1") return { ok: true } as const;

  const current = await getAnthropicSpendToday(spend?.workspaceId);
  const budget = anthropicBudgetResult(current, {
    model,
    inputTokens: prediction.inputTokens,
    outputTokens: prediction.outputTokens,
  });
  if (budget.ok) return { ok: true } as const;
  return {
    ok: false as const,
    error: budgetExceededMessage(budget),
    status: 429,
  };
}

async function maybeLogUsage(params: {
  usage: ClaudeUsage;
  model: AnthropicModel;
  spend?: AnthropicSpendContext;
}) {
  if (!params.spend?.trackUsage) return;
  await logAnthropicSpend({
    workspaceId: params.spend.workspaceId,
    userId: params.spend.userId,
    senderPhone: params.spend.senderPhone,
    direction: params.spend.direction ?? "out",
    model: params.model,
    usage: params.usage,
    payload: params.spend.payload,
  });
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
  spend?: AnthropicSpendContext;
}): Promise<ClaudeToolResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY not set" };

  const model = coerceModel(opts.model);
  const maxTokens = opts.maxTokens ?? 1_024;
  const estimated = estimatedTokensForAnthropicRequest({
    model,
    system: opts.system,
    messages: opts.messages,
    tools: opts.tools,
    maxTokens,
  });

  const canProceed = await maybeRejectOnBudget(model, opts.spend, estimated);
  if (!canProceed.ok) return canProceed;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
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

  const json = (await resp.json()) as AnthropicApiResponse;
  const usage: AnthropicUsage = json.usage ?? {
    input_tokens: estimated.inputTokens,
    output_tokens: Math.min(maxTokens, estimated.outputTokens),
  };
  const costMillicents = estimateAnthropicMillicents(model, usage);

  await maybeLogUsage({
    usage,
    model,
    spend: {
      ...opts.spend,
      ...(opts.spend?.payload
        ? { payload: { ...withPayload(opts.spend.payload), model } }
        : { payload: { model } }),
    },
  });

  return {
    ok: true,
    stopReason: json.stop_reason,
    content: json.content,
    usage,
    costMillicents,
  };
}

export async function claudeChat(opts: {
  system?: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  spend?: AnthropicSpendContext;
}): Promise<ClaudeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY not set" };

  const model = coerceModel(opts.model);
  const maxTokens = opts.maxTokens ?? 1_024;
  const estimated = estimatedTokensForAnthropicRequest({
    model,
    system: opts.system,
    prompt: opts.prompt,
    maxTokens,
  });

  const canProceed = await maybeRejectOnBudget(model, opts.spend, estimated);
  if (!canProceed.ok) return canProceed;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    return { ok: false, error: body || `HTTP ${resp.status}`, status: resp.status };
  }

  const json = (await resp.json()) as AnthropicTextResponse;
  const text =
    json.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n") ??
    "";
  const usage: AnthropicUsage = json.usage ?? {
    input_tokens: estimated.inputTokens,
    output_tokens: Math.min(maxTokens, estimated.outputTokens),
  };

  await maybeLogUsage({
    usage,
    model,
    spend: {
      ...opts.spend,
      ...(opts.spend?.payload
        ? { payload: { ...withPayload(opts.spend.payload), model } }
        : { payload: { model } }),
    },
  });

  return { ok: true, text, usage };
}
