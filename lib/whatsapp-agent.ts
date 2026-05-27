/**
 * WhatsApp agent loop.
 *
 * Multi-user shared-workspace model:
 *  1. Inbound message arrives with `senderPhone`.
 *  2. We look up users.whatsapp_phone → user.id + current_workspace_id.
 *  3. The conversation, tool actions, and reminders are scoped to that user
 *     within their workspace. All workspace members see the same data, but
 *     each conversation is per-sender so two partners texting concurrently
 *     don't collide.
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
const STATE_TTL_MS = 30 * 60 * 1000;

export type AgentResult =
  | {
      ok: true;
      reply: string;
      toolCalls: string[];
      tokensIn: number;
      tokensOut: number;
    }
  | { ok: false; reply: string; error: string };

export type ConversationState = {
  messages: ClaudeMessage[];
  pendingIntent: unknown | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Sender → user → workspace resolution
// ─────────────────────────────────────────────────────────────────────────────

function normalizePhone(p: string): string {
  return p.replace(/[^0-9]/g, "");
}

export type ResolvedSender = {
  userId: string;
  workspaceId: string;
  displayName: string;
  timezone: string;
  persona: string | null;
};

/**
 * Match an inbound WhatsApp number to a user row + their current workspace.
 * Returns null if the sender isn't a registered user — the webhook should
 * reject (or politely decline) at that point.
 */
export async function resolveSender(
  senderPhone: string,
): Promise<ResolvedSender | null> {
  const normalized = normalizePhone(senderPhone);
  if (!normalized) return null;

  // Match users.whatsapp_phone exactly *or* by digits-only equality so we're
  // tolerant of `+`, spaces, dashes on either side.
  const candidates = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      timezone: users.timezone,
      whatsappPhone: users.whatsappPhone,
      whatsappPersona: users.whatsappPersona,
      currentWorkspaceId: users.currentWorkspaceId,
    })
    .from(users)
    .where(sql`${users.whatsappPhone} is not null`);

  const u = candidates.find(
    (c) => c.whatsappPhone && normalizePhone(c.whatsappPhone) === normalized,
  );
  if (!u || !u.currentWorkspaceId) return null;

  return {
    userId: u.id,
    workspaceId: u.currentWorkspaceId,
    displayName: u.displayName,
    timezone: u.timezone,
    persona: u.whatsappPersona ?? null,
  };
}

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

  const age = Date.now() - new Date(row.updatedAt).getTime();
  if (age > STATE_TTL_MS) return { messages: [], pendingIntent: null };

  return {
    messages: (row.messages as ClaudeMessage[]) ?? [],
    pendingIntent: row.pendingIntent ?? null,
  };
}

async function saveState(
  senderPhone: string,
  workspaceId: string,
  userId: string,
  state: ConversationState,
) {
  const trimmed = state.messages.slice(-HISTORY_CAP);
  await db
    .insert(waConversations)
    .values({
      senderPhone,
      workspaceId,
      userId,
      messages: trimmed,
      pendingIntent: state.pendingIntent,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: waConversations.senderPhone,
      set: {
        workspaceId,
        userId,
        messages: trimmed,
        pendingIntent: state.pendingIntent,
        updatedAt: new Date(),
      },
    });
}

async function logActivity(opts: {
  workspaceId: string | null;
  userId: string | null;
  senderPhone: string;
  direction: "in" | "out" | "tool" | "reject" | "error";
  payload: unknown;
  tokensIn?: number;
  tokensOut?: number;
}) {
  await db.insert(waActivity).values({
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    senderPhone: opts.senderPhone,
    direction: opts.direction,
    payload: opts.payload,
    tokensIn: opts.tokensIn,
    tokensOut: opts.tokensOut,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily token budget — applied per-workspace.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_DAILY_TOKEN_CAP = 300_000;

async function tokenSpendToday(workspaceId: string): Promise<number> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const rows = await db
    .select({
      sumIn: sql<number>`coalesce(sum(${waActivity.tokensIn}), 0)`,
      sumOut: sql<number>`coalesce(sum(${waActivity.tokensOut}), 0)`,
    })
    .from(waActivity)
    .where(
      and(
        eq(waActivity.workspaceId, workspaceId),
        gte(waActivity.createdAt, since),
      ),
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
  userName: string;
  userTimezone: string;
  persona: string | null;
  now: Date;
  pendingIntent: unknown | null;
}): string {
  const today = opts.now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: opts.userTimezone,
  });
  return [
    `You are a chief-of-staff assistant for ${opts.userName} embedded in their shared workspace CRM.`,
    `Today is ${today}. Their timezone is ${opts.userTimezone}.`,
    opts.persona
      ? `\nPersona instruction (how to address this user in greetings/replies): ${opts.persona}`
      : "",
    "",
    "All workspace members share the same contacts, projects, milestones, meetings, and touches. " +
      "Reminders, however, are personal to the texter.",
    "",
    "Capabilities:",
    "- Log touches (interactions) on contacts",
    "- Create contacts (only after find_contact returns no match AND the user confirmed creation)",
    "- Schedule personal reminders (one-shot, daily, weekly, monthly)",
    "- Mark milestones done (DESTRUCTIVE — confirm with user first)",
    "- Summarize status (overdue / blocked / stale)",
    "- Brief a contact's recent touches",
    "",
    "Style:",
    "- Reply in plain text, 1–3 sentences usually. WhatsApp doesn't render markdown.",
    "- For ambiguous names ('Marta'), call find_contact first; if 2+ matches, ask which one.",
    "- For dates: ALWAYS resolve to a full ISO datetime with the user's timezone offset before calling schedule_reminder.",
    "- For destructive ops (mark done, cancel reminder): preview and require explicit confirmation in the next message.",
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

  const resolved = await resolveSender(opts.senderPhone);
  if (!resolved) {
    await logActivity({
      workspaceId: null,
      userId: null,
      senderPhone: opts.senderPhone,
      direction: "reject",
      payload: { reason: "unknown-sender" },
    });
    return {
      ok: false,
      reply:
        "I don't recognize this number. Ask the workspace owner to add it to your profile in the CRM (/profile → WhatsApp).",
      error: "unknown-sender",
    };
  }

  // Daily token cap (per workspace).
  const spent = await tokenSpendToday(resolved.workspaceId);
  if (spent > dailyCap()) {
    await logActivity({
      workspaceId: resolved.workspaceId,
      userId: resolved.userId,
      senderPhone: opts.senderPhone,
      direction: "reject",
      payload: { reason: "daily-token-cap", spent, cap: dailyCap() },
    });
    return {
      ok: false,
      reply:
        "Daily AI budget reached for this workspace. Try again tomorrow or use slash commands (/log /find /help).",
      error: "daily-token-cap",
    };
  }

  const now = new Date();
  const state = await loadState(opts.senderPhone);
  state.messages.push({ role: "user", content: opts.body });
  await logActivity({
    workspaceId: resolved.workspaceId,
    userId: resolved.userId,
    senderPhone: opts.senderPhone,
    direction: "in",
    payload: { body: opts.body },
  });

  const ctx: ToolContext = {
    workspaceId: resolved.workspaceId,
    userId: resolved.userId,
    ownerTimezone: resolved.timezone,
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
        userName: resolved.displayName,
        userTimezone: resolved.timezone,
        persona: resolved.persona,
        now,
        pendingIntent,
      }),
      messages: state.messages,
      tools: TOOL_DEFINITIONS,
      maxTokens: 1024,
    });

    if (!result.ok) {
      await logActivity({
        workspaceId: resolved.workspaceId,
        userId: resolved.userId,
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

    const assistantContent: ClaudeMessageContent[] = [];
    const toolUses: Array<{
      id: string;
      name: string;
      input: Record<string, unknown>;
    }> = [];
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
      pendingIntent = null;
      break;
    }

    if (result.stopReason === "tool_use" && toolUses.length > 0) {
      const toolResults: ClaudeMessageContent[] = [];
      for (const call of toolUses) {
        toolCalls.push(call.name);
        const r = await executeTool(call.name, call.input, ctx);
        await logActivity({
          workspaceId: resolved.workspaceId,
          userId: resolved.userId,
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

    replyText =
      textOut.trim() || "I'm not sure how to handle that. Try /help.";
    break;
  }

  if (!replyText) {
    replyText = "I'm having trouble completing that. Try rephrasing.";
  }

  await saveState(opts.senderPhone, resolved.workspaceId, resolved.userId, {
    messages: state.messages,
    pendingIntent,
  });
  await logActivity({
    workspaceId: resolved.workspaceId,
    userId: resolved.userId,
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
