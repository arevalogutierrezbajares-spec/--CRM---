import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export type AnthropicModel =
  | "claude-haiku-4-5"
  | "claude-sonnet-4-6"
  | "claude-opus-4-7"
  | "claude-opus-4-8";

export type AnthropicUsage = {
  input_tokens: number;
  output_tokens: number;
};

export type AnthropicSpend = {
  tokensIn: number;
  tokensOut: number;
  costMillicents: number;
};

export type AnthropicBudgetCheck = {
  ok: true;
  reason?: never;
  remainingTokens: number;
  remainingMillicents: number | null;
};

export type AnthropicBudgetBlock = {
  ok: false;
  reason: "token-cap" | "cost-cap";
  remainingTokens: number;
  remainingMillicents: number | null;
};

export type AnthropicBudgetResult = AnthropicBudgetCheck | AnthropicBudgetBlock;

type AnthropicPriceTable = Record<AnthropicModel, { input: number; output: number }>;

// USD per 1M tokens (input / output). Source: Anthropic model catalog 2026-06-04.
const DEFAULT_PRICING: AnthropicPriceTable = {
  "claude-haiku-4-5": {
    input: 1,
    output: 5,
  },
  "claude-sonnet-4-6": {
    input: 3,
    output: 15,
  },
  "claude-opus-4-7": {
    input: 5,
    output: 25,
  },
  "claude-opus-4-8": {
    input: 5,
    output: 25,
  },
};

const DEFAULT_ANTHROPIC_MODEL: AnthropicModel = "claude-haiku-4-5";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function isAnthropicModel(value: string | undefined | null): value is AnthropicModel {
  return (
    value === "claude-haiku-4-5" ||
    value === "claude-sonnet-4-6" ||
    value === "claude-opus-4-7" ||
    value === "claude-opus-4-8"
  );
}

function parseAnthropicModel(value: string | undefined | null): AnthropicModel {
  return isAnthropicModel(value) ? value : DEFAULT_ANTHROPIC_MODEL;
}

function pricingTable(): AnthropicPriceTable {
  const raw = process.env.ANTHROPIC_PRICE_PER_1M_USD;
  if (!raw) return DEFAULT_PRICING;
  try {
    const parsed = JSON.parse(raw) as Partial<AnthropicPriceTable>;
    const table = {} as AnthropicPriceTable;
    for (const model of Object.keys(DEFAULT_PRICING) as AnthropicModel[]) {
      const override = parsed[model];
      const fallback = DEFAULT_PRICING[model];
      table[model] = {
        input: typeof override?.input === "number" && override.input > 0 ? override.input : fallback.input,
        output: typeof override?.output === "number" && override.output > 0 ? override.output : fallback.output,
      };
    }
    return table;
  } catch {
    return DEFAULT_PRICING;
  }
}

function estimateTokensFromText(text: string): number {
  return Math.max(1, Math.ceil((text.length || 0) / 4));
}

export function defaultAnthropicModel(): AnthropicModel {
  return parseAnthropicModel(process.env.ANTHROPIC_DEFAULT_MODEL);
}

/**
 * Workload tiers — route each kind of task to a fitting model instead of
 * defaulting everything to the cheapest one. Haiku stays the workhorse for
 * cheap high-volume work; reasoning-heavy and user-facing work gets Sonnet;
 * deep synthesis can opt into Opus. Override any tier per-deploy with
 * ANTHROPIC_MODEL_<WORKLOAD> (e.g. ANTHROPIC_MODEL_STRATEGY=claude-opus-4-8).
 *   intake    — classification / extraction / routing (cheap, high-volume)
 *   chat      — the conversational chief-of-staff brain (user-facing)
 *   briefing  — weekly briefing, nudges, meeting → action synthesis, drafts
 *   strategy  — deep multi-step reasoning / roadmap synthesis
 */
export type AnthropicWorkload = "intake" | "chat" | "briefing" | "strategy";

const WORKLOAD_DEFAULTS: Record<AnthropicWorkload, AnthropicModel> = {
  intake: "claude-haiku-4-5",
  chat: "claude-sonnet-4-6",
  briefing: "claude-sonnet-4-6",
  strategy: "claude-opus-4-8",
};

export function modelForWorkload(workload: AnthropicWorkload): AnthropicModel {
  const override = process.env[`ANTHROPIC_MODEL_${workload.toUpperCase()}`];
  return isAnthropicModel(override) ? override : WORKLOAD_DEFAULTS[workload];
}

export function estimateAnthropicMillicents(
  model: AnthropicModel,
  usage: AnthropicUsage,
): number {
  const p = pricingTable()[model];
  // USD -> millicents: (tokens / 1_000_000) * usd-per-1M * 1000
  const inputMillicents = (usage.input_tokens * p.input) / 1000;
  const outputMillicents = (usage.output_tokens * p.output) / 1000;
  return Math.ceil(inputMillicents + outputMillicents);
}

export function estimatedTokensForAnthropicRequest(params: {
  model?: string;
  system?: string;
  prompt?: string;
  maxTokens?: number;
  tools?: Array<unknown>;
  messages?: unknown;
}): {
  model: AnthropicModel;
  inputTokens: number;
  outputTokens: number;
} {
  const model = parseAnthropicModel(params.model);
  const payload = {
    model,
    system: params.system ?? "",
    prompt: params.prompt ?? "",
    messages: params.messages ?? [],
    tools: params.tools ?? [],
  };
  const inputTokens = estimateTokensFromText(JSON.stringify(payload));
  const outputTokens = params.maxTokens ?? 800;
  return { model, inputTokens, outputTokens };
}

export function getAnthropicTokenCap(): number | null {
  const cap = envInt("ANTHROPIC_DAILY_TOKEN_CAP", -1);
  if (cap > 0) return cap;
  const legacy = envInt("AGB_WA_DAILY_TOKEN_CAP", -1);
  return legacy > 0 ? legacy : null;
}

export function getAnthropicCostCapMillicents(): number | null {
  const usd = envFloat("ANTHROPIC_DAILY_BUDGET_USD", 3);
  if (usd > 0) return Math.round(usd * 1000);

  const legacy = envFloat("AGB_ANTHROPIC_DAILY_BUDGET_USD", 0);
  return legacy > 0 ? Math.round(legacy * 1000) : null;
}

export async function getAnthropicSpendToday(
  workspaceId: string | null | undefined,
): Promise<AnthropicSpend> {
  if (!process.env.DATABASE_URL) {
    return { tokensIn: 0, tokensOut: 0, costMillicents: 0 };
  }

  const since = new Date();
  since.setHours(0, 0, 0, 0);

  try {
    const filters = [gte(schema.waActivity.createdAt, since)];
    if (workspaceId) {
      filters.push(eq(schema.waActivity.workspaceId, workspaceId));
    }
    const rows = await db
      .select({
        sumIn: sql<number>`coalesce(sum(${schema.waActivity.tokensIn}), 0)`,
        sumOut: sql<number>`coalesce(sum(${schema.waActivity.tokensOut}), 0)`,
        sumCost: sql<number>`coalesce(sum(${schema.waActivity.costMillicents}), 0)`,
      })
      .from(schema.waActivity)
      .where(and(...filters));
    const row = rows[0];
    if (!row) {
      return { tokensIn: 0, tokensOut: 0, costMillicents: 0 };
    }
    return {
      tokensIn: Number(row.sumIn) || 0,
      tokensOut: Number(row.sumOut) || 0,
      costMillicents: Number(row.sumCost) || 0,
    };
  } catch {
    // If spend analytics are unavailable, stay permissive.
    return { tokensIn: 0, tokensOut: 0, costMillicents: 0 };
  }
}

export function anthropicBudgetResult(
  current: AnthropicSpend,
  predicted: { model: AnthropicModel; inputTokens: number; outputTokens: number },
): AnthropicBudgetResult {
  const tokenCap = getAnthropicTokenCap();
  const costCap = getAnthropicCostCapMillicents();
  const projectedCost = estimateAnthropicMillicents(predicted.model, {
    input_tokens: predicted.inputTokens,
    output_tokens: predicted.outputTokens,
  });
  const totalTokens = current.tokensIn + current.tokensOut;

  if (tokenCap !== null && totalTokens + predicted.inputTokens + predicted.outputTokens > tokenCap) {
    return {
      ok: false,
      reason: "token-cap",
      remainingTokens: Math.max(0, tokenCap - totalTokens),
      remainingMillicents: costCap === null ? null : Math.max(0, costCap - current.costMillicents),
    };
  }

  if (costCap !== null && current.costMillicents + projectedCost > costCap) {
    return {
      ok: false,
      reason: "cost-cap",
      remainingTokens: Number.MAX_SAFE_INTEGER,
      remainingMillicents: Math.max(0, costCap - current.costMillicents),
    };
  }

  return {
    ok: true,
    remainingTokens: tokenCap === null ? Number.MAX_SAFE_INTEGER : Math.max(0, tokenCap - totalTokens),
    remainingMillicents: costCap === null ? null : Math.max(0, costCap - current.costMillicents),
  };
}

export function budgetExceededMessage(result: AnthropicBudgetBlock): string {
  if (result.reason === "token-cap") {
    return "Anthropic daily token budget reached";
  }
  return "Anthropic daily cost budget reached";
}

export async function logAnthropicSpend(params: {
  workspaceId?: string | null;
  userId?: string | null;
  senderPhone?: string | null;
  direction?: "in" | "out" | "tool" | "reject" | "error";
  model: AnthropicModel;
  usage: AnthropicUsage;
  payload?: unknown;
}) {
  if (!process.env.DATABASE_URL) return;
  if (!params.senderPhone && !params.userId) return;

  try {
    const costMillicents = estimateAnthropicMillicents(params.model, params.usage);
    await db.insert(schema.waActivity).values({
      workspaceId: params.workspaceId,
      userId: params.userId ?? null,
      senderPhone: params.senderPhone ?? `user:${params.userId}`,
      direction: params.direction ?? "out",
      payload: { ...(params.payload ?? {}), model: params.model },
      tokensIn: params.usage.input_tokens,
      tokensOut: params.usage.output_tokens,
      costMillicents,
    });
  } catch {
    // Logging should never block a user-visible Claude request.
  }
}
