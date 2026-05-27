/**
 * WhatsApp agent loop.
 *
 * Reads conversation state from `wa_conversations`, asks Claude for a tool
 * call or final text, executes tools, persists state + activity, returns a
 * reply string. All I/O (DB + Claude) is here; the route handler in
 * /api/whatsapp/webhook only handles auth/signature/rate-limit/send.
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  claudeWithTools,
  isAnthropicConfigured,
  type ClaudeMessage,
  type ClaudeMessageContent,
} from "@/lib/anthropic";
import {
  TOOL_DEFINITIONS,
  executeTool,
  type ToolContext,
} from "@/lib/whatsapp-tools";

const { waConversations, waActivity, users } = schema;

const MAX_TURNS = 6;
const HISTORY_CAP = 10;
// 30-minute idle window. Older state is dropped on the next inbound message.
const STATE_TTL_MS = 30 * 60 * 1000;

export type AgentResult =
  | { ok: true; reply: string; toolCalls: string[]; tokensIn: number; tokensOut: number }
  | { ok: false; reply: string; error: string };

export type ConversationState = {
  messages: ClaudeMessage[];
  pendingIntent: unknown | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// State persistence
// ─────────────────────────────────────────────────────────────────────────────

async function loadState(senderPhone: string): Promise<ConversationState> {
  const [row] = await db
    .select()
    .from(waConversations)
    .where(eq(waConversations.senderPhone, senderPhone))
    .limit(1);
  if (!row) return { messages: [], pendingIntent: null };

  // TTL: drop state older than STATE_TTL_MS.
  const age = Date.now() - new Date(row.updatedAt).getTime();
  if (age > STATE_TTL_MS) return { messages: [], pendingIntent: null };

  return {
    messages: (row.messages as ClaudeMessage[]) ?? [],
    pendingIntent: row.pendingIntent ?? null,
  };
}

async function saveState(
  senderPhone: string,
  ownerId: string,
  state: ConversationState,
) {
  // Keep only the most recent HISTORY_CAP messages.
  const trimmed = state.messages.slice(-HISTORY_CAP);
  await db
    .insert(waConversations)
    .values({
      senderPhone,
      ownerId,
      messages: trimmed,
      pendingIntent: state.pendingIntent,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: waConversations.senderPhone,
      set: {
        ownerId,
        messages: trimmed,
        pendingIntent: state.pendingIntent,
        updatedAt: new Date(),
      },
    });
}

async function logActivity(opts: {
  ownerId: string;
  senderPhone: string;
  direction: "in" | "out" | "tool" | "reject" | "error";
  payload: unknown;
  tokensIn?: number;
  tokensOut?: number;
}) {
  await db.insert(waActivity).values({
    ownerId: opts.ownerId,
    senderPhone: opts.senderPhone,
    direction: opts.direction,
    payload: opts.payload,
    tokensIn: opts.tokensIn,
    tokensOut: opts.tokensOut,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily token budget
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_DAILY_TOKEN_CAP = 300_000;

async function tokenSpendToday(ownerId: string): Promise<number> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const rows = await db
    .select({
      sumIn: sql<number>`coalesce(sum(${waActivity.tokensIn}), 0)`,
      sumOut: sql<number>`coalesce(sum(${waActivity.tokensOut}), 0)`,
    })
    .from(waActivity)
    .where(
      and(eq(waActivity.ownerId, ownerId), gte(waActivity.createdAt, since)),
    );
  const row = rows[0] ?? { sumIn: 0, sumOut: 0 };
  return Number(row.sumIn) + Number(row.sumOut);
}

function dailyCap(): number {
  const raw = process.env.AGB_WA_DAILY_TOKEN_CAP;
  if (!raw) return DEFAULT_DAILY_TOKEN_CAP;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_TOKEN_CAP;
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────────────────────

function systemPrompt(opts: {
  ownerName: string;
  ownerTimezone: string;
  now: Date;
  pendingIntent: unknown | null;
}): string {
  const today = opts.now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: opts.ownerTimezone,
  });
  return [
    `You are a chief-of-staff assistant for ${opts.ownerName} embedded in their CRM.`,
    `Today is ${today}. Their timezone is ${opts.ownerTimezone}.`,
    "",
    "Capabilities:",
    "- Log touches (interactions) on contacts",
    "- Create contacts (only after find_contact returns no match AND the user confirmed creation)",
    "- Schedule reminders (one-shot, daily, weekly, monthly)",
    "- Mark milestones done (DESTRUCTIVE — confirm with user first)",
    "- Summarize status (overdue / blocked / stale)",
    "- Brief a contact's recent touches",
    "",
    "Style:",
    "- Reply in plain text, 1–3 sentences usually. WhatsApp doesn't render markdown.",
    "- For ambiguous names ('Marta'), call find_contact first; if 2+ matches, ask which one.",
    "- For dates: ALWAYS resolve to a full ISO datetime with the user's timezone offset before calling schedule_reminder. Today is the reference date.",
    "- For destructive ops (mark done, cancel reminder): preview the action and require explicit confirmation in the next user message.",
    "- Never invent contact_ids, project_ids, or milestone_ids. Always look them up first.",
    "",
    "When you have enough info to act, call the tool. Don't narrate.",
    opts.pendingIntent
      ? `\nPending intent from prior turn:\n${JSON.stringify(opts.pendingIntent, null, 2)}`
      : "",
  ]
    .join("\n")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent loop
// ─────────────────────────────────────────────────────────────────────────────

export async function handleMessage(opts: {
  ownerId: string;
  senderPhone: string;
  body: string;
}): Promise<AgentResult> {
  if (!isAnthropicConfigured()) {
    return {
      ok: false,
      reply: "AI brain isn't configured. Use slash commands: /log /find /help.",
      error: "ANTHROPIC_API_KEY missing",
    };
  }

  // Resolve owner details for tz + greeting.
  const [owner] = await db
    .select({ id: users.id, displayName: users.displayName, timezone: users.timezone })
    .from(users)
    .where(eq(users.id, opts.ownerId))
    .limit(1);
  if (!owner) {
    return { ok: false, reply: "User not found.", error: "owner missing" };
  }

  // Daily token cap
  const spent = await tokenSpendToday(opts.ownerId);
  if (spent > dailyCap()) {
    await logActivity({
      ownerId: opts.ownerId,
      senderPhone: opts.senderPhone,
      direction: "reject",
      payload: { reason: "daily-token-cap", spent, cap: dailyCap() },
    });
    return {
      ok: false,
      reply:
        "Daily AI budget reached. Try again tomorrow or use slash commands (/log /find /help).",
      error: "daily-token-cap",
    };
  }

  const now = new Date();
  const state = await loadState(opts.senderPhone);
  // Append the inbound user message.
  state.messages.push({ role: "user", content: opts.body });
  await logActivity({
    ownerId: opts.ownerId,
    senderPhone: opts.senderPhone,
    direction: "in",
    payload: { body: opts.body },
  });

  const ctx: ToolContext = {
    ownerId: opts.ownerId,
    ownerTimezone: owner.timezone,
    now,
  };

  const toolCalls: string[] = [];
  let totalIn = 0;
  let totalOut = 0;
  let replyText = "";
  let pendingIntent = state.pendingIntent;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const result = await claudeWithTools({
      system: systemPrompt({
        ownerName: owner.displayName,
        ownerTimezone: owner.timezone,
        now,
        pendingIntent,
      }),
      messages: state.messages,
      tools: TOOL_DEFINITIONS,
      maxTokens: 1024,
    });

    if (!result.ok) {
      await logActivity({
        ownerId: opts.ownerId,
        senderPhone: opts.senderPhone,
        direction: "error",
        payload: { stage: "claude", error: result.error },
      });
      return {
        ok: false,
        reply: "I'm having trouble right now. Try again in a minute.",
        error: result.error,
      };
    }

    totalIn += result.usage.input_tokens;
    totalOut += result.usage.output_tokens;

    // Collect assistant content + walk through tool_use blocks.
    const assistantContent: ClaudeMessageContent[] = [];
    const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
    let textOut = "";

    for (const block of result.content) {
      if (block.type === "text") {
        textOut += block.text;
        assistantContent.push({ type: "text", text: block.text });
      } else if (block.type === "tool_use") {
        toolUses.push({ id: block.id, name: block.name, input: block.input });
        assistantContent.push({
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: block.input,
        });
      }
    }

    state.messages.push({ role: "assistant", content: assistantContent });

    if (result.stopReason === "end_turn") {
      replyText = textOut.trim() || "Done.";
      // Clear pending intent on a successful final turn.
      pendingIntent = null;
      break;
    }

    if (result.stopReason === "tool_use" && toolUses.length > 0) {
      const toolResults: ClaudeMessageContent[] = [];
      for (const call of toolUses) {
        toolCalls.push(call.name);
        const r = await executeTool(call.name, call.input, ctx);
        await logActivity({
          ownerId: opts.ownerId,
          senderPhone: opts.senderPhone,
          direction: "tool",
          payload: { name: call.name, input: call.input, result: r },
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify(r),
          is_error: !r.ok,
        });
      }
      state.messages.push({ role: "user", content: toolResults });
      continue;
    }

    // Stop reason was max_tokens / stop_sequence with no tool call — bail out.
    replyText = textOut.trim() || "I'm not sure how to handle that. Try /help.";
    break;
  }

  if (!replyText) {
    replyText = "I'm having trouble completing that. Try rephrasing.";
  }

  await saveState(opts.senderPhone, opts.ownerId, {
    messages: state.messages,
    pendingIntent,
  });
  await logActivity({
    ownerId: opts.ownerId,
    senderPhone: opts.senderPhone,
    direction: "out",
    payload: { body: replyText, toolCalls },
    tokensIn: totalIn,
    tokensOut: totalOut,
  });

  return {
    ok: true,
    reply: replyText,
    toolCalls,
    tokensIn: totalIn,
    tokensOut: totalOut,
  };
}
