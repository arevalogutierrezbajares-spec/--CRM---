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

import { and, eq, gte, sql } from "drizzle-orm";
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
} from "@/lib/wa-agent/tools";
import { classifyIntent } from "@/lib/wa-agent/intent/classify";
import { getWorkflow } from "@/lib/wa-agent/intent/workflows";
import { resolveMentions, mentionSupplementLine } from "@/lib/wa-agent/mention-resolver";

const { waConversations, waActivity, users } = schema;

const MAX_TURNS = 6;
const HISTORY_CAP = 20; // pairs, not individual messages
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

/**
 * Trim conversation history to at most HISTORY_CAP messages, but never
 * start the slice on a tool_result block — that would orphan it from its
 * preceding tool_use and cause Claude API errors.
 */
function trimHistory(messages: ClaudeMessage[]): ClaudeMessage[] {
  if (messages.length <= HISTORY_CAP) return messages;
  let start = messages.length - HISTORY_CAP;
  // Walk forward until we're not starting on a tool_result block.
  while (start < messages.length) {
    const msg = messages[start];
    const isToolResult =
      Array.isArray(msg.content) &&
      msg.content.some((b) => (b as ClaudeMessageContent).type === "tool_result");
    if (!isToolResult) break;
    start++;
  }
  return messages.slice(start);
}

async function saveState(
  senderPhone: string,
  workspaceId: string,
  userId: string,
  state: ConversationState,
) {
  const trimmed = trimHistory(state.messages);
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
  workflowSupplement?: string;
  confirmationPending?: boolean;
}): string {
  const today = opts.now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: opts.userTimezone,
  });
  return [
    `Chief-of-staff for ${opts.userName} in a shared workspace CRM. Today: ${today}. TZ: ${opts.userTimezone}.`,
    opts.persona ? `Persona: ${opts.persona}` : "",
    "Workspace data (contacts/projects/milestones/meetings/touches) is shared; reminders are personal.",
    "Rules: reply in plain text (no markdown), 1–3 sentences. Resolve dates to ISO with TZ offset before scheduling. Never invent UUIDs — look them up. For destructive ops, preview and require explicit YES first.",
    "Call tools when you have enough info; don't narrate the plan.",
    opts.workflowSupplement ? opts.workflowSupplement : "",
    opts.confirmationPending ? "The user just confirmed the pending action — execute it now." : "",
    opts.pendingIntent
      ? `Pending from prior turn: ${JSON.stringify(opts.pendingIntent)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent loop
// ─────────────────────────────────────────────────────────────────────────────

export async function handleMessage(opts: {
  senderPhone: string;
  body: string;
  /** Set when this message is the transcript of an inbound voice note. */
  sourceVoiceNoteId?: string | null;
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

  return handleResolvedMessage({
    senderKey: opts.senderPhone,
    body: opts.body,
    resolved,
    sourceVoiceNoteId: opts.sourceVoiceNoteId ?? null,
  });
}

/**
 * Web entry point — caller already has an authenticated session user.
 * Conversation state is keyed under `web:<userId>` so web threads don't
 * collide with the user's WhatsApp thread; both can coexist for the same
 * person and have independent history.
 */
export async function handleMessageForUser(opts: {
  userId: string;
  body: string;
}): Promise<AgentResult> {
  if (!isAnthropicConfigured()) {
    return {
      ok: false,
      reply: "AI brain isn't configured. Set ANTHROPIC_API_KEY and reload.",
      error: "ANTHROPIC_API_KEY missing",
    };
  }

  const [u] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      timezone: users.timezone,
      whatsappPersona: users.whatsappPersona,
      currentWorkspaceId: users.currentWorkspaceId,
    })
    .from(users)
    .where(eq(users.id, opts.userId))
    .limit(1);

  if (!u || !u.currentWorkspaceId) {
    return {
      ok: false,
      reply: "I can't find your workspace. Visit /profile to set one up.",
      error: "no-workspace",
    };
  }

  const resolved: ResolvedSender = {
    userId: u.id,
    workspaceId: u.currentWorkspaceId,
    displayName: u.displayName,
    timezone: u.timezone,
    persona: u.whatsappPersona ?? null,
  };

  return handleResolvedMessage({
    senderKey: `web:${opts.userId}`,
    body: opts.body,
    resolved,
  });
}

/**
 * Shared agent core. Both transports (WhatsApp + web) call this once the
 * sender has been resolved to a user+workspace.
 */
async function handleResolvedMessage(opts: {
  senderKey: string;
  body: string;
  resolved: ResolvedSender;
  sourceVoiceNoteId?: string | null;
}): Promise<AgentResult> {
  const { senderKey, body, resolved } = opts;

  // Daily token cap (per workspace).
  const spent = await tokenSpendToday(resolved.workspaceId);
  if (spent > dailyCap()) {
    await logActivity({
      workspaceId: resolved.workspaceId,
      userId: resolved.userId,
      senderPhone: senderKey,
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
  const state = await loadState(senderKey);

  // ── Intent classification & workflow gating ──────────────────────────────
  const classification = classifyIntent(body);
  // Voice notes are the primary action-capture channel: if a transcript didn't
  // match a stronger intent, default to capturing action items from it.
  if (opts.sourceVoiceNoteId && classification.intent === "unknown") {
    classification.intent = "action_capture";
    classification.confidence = "low";
  }
  const workflow = getWorkflow(classification.intent);

  // Confirmation handling: if user said "yes/no" and there's a pending intent,
  // route as confirmation of that prior action.
  const isConfirmYes =
    classification.intent === "confirmation" && classification.isConfirmYes === true;
  const isConfirmNo =
    classification.intent === "confirmation" && !isConfirmYes;
  const hasPendingIntent = !!state.pendingIntent;

  // Short-circuit "no" when something was pending
  if (isConfirmNo && hasPendingIntent) {
    state.pendingIntent = null;
    await saveState(senderKey, resolved.workspaceId, resolved.userId, state);
    await logActivity({
      workspaceId: resolved.workspaceId,
      userId: resolved.userId,
      senderPhone: senderKey,
      direction: "in",
      payload: { body: body, intent: "confirmation:no" },
    });
    return {
      ok: true,
      reply: "Got it, action cancelled.",
      toolCalls: [],
      tokensIn: 0,
      tokensOut: 0,
    };
  }

  // For requireConfirmation intents without an existing pendingIntent,
  // inject supplement telling agent to preview only.
  const needsConfirmFirst =
    !!workflow.requireConfirmation && !hasPendingIntent && !isConfirmYes;
  const confirmationJustReceived = isConfirmYes && hasPendingIntent;

  // ── Mention pre-resolver (Phase 4) ───────────────────────────────────
  // Run before the LLM so Claude gets contact IDs without spending a tool turn.
  // Note: the RESOLVED line goes on EVERY turn (it's ground truth Claude needs
  // throughout the conversation, including when composing the final reply).
  // The workflow supplement only goes on turn 0 (it's the "what to do" hint).
  const mentionMatches = await resolveMentions(resolved.workspaceId, body);
  const mentionHint = mentionSupplementLine(mentionMatches);

  let turn0Supplement = workflow.supplement ?? "";
  if (needsConfirmFirst) {
    turn0Supplement +=
      "\nCONFIRMATION GATE: Describe exactly what you are about to do, then ask the user YES or NO to confirm. Do NOT call any write/destructive tools yet.";
  }

  state.messages.push({ role: "user", content: body });
  await logActivity({
    workspaceId: resolved.workspaceId,
    userId: resolved.userId,
    senderPhone: senderKey,
    direction: "in",
    payload: { body: body, intent: classification.intent },
  });

  const ctx: ToolContext = {
    workspaceId: resolved.workspaceId,
    userId: resolved.userId,
    ownerTimezone: resolved.timezone,
    now,
    sourceVoiceNoteId: opts.sourceVoiceNoteId ?? null,
  };

  const toolCalls: string[] = [];
  let totalIn = 0;
  let totalOut = 0;
  let replyText = "";
  let pendingIntent = state.pendingIntent;
  let requiredToolMet = false; // tracks whether a requiredTool was called this turn
  let requiredRetryDone = false;

  // ── Token diet: send only the tools this intent can use, and pick model ───
  const allowedNames = workflow.allowedTools;
  const tools = allowedNames
    ? TOOL_DEFINITIONS.filter((t) => allowedNames.includes(t.name))
    : TOOL_DEFINITIONS;
  const model = workflow.model ?? "claude-sonnet-4-6";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // On turn 0 we send the full supplement (workflow nudge + confirmation
    // gate + resolved mentions). On later turns we only carry the resolved
    // mentions forward so Claude doesn't forget the contact org/rel when
    // composing the reply, but stops getting nagged about the workflow plan.
    const supplementForTurn = turn === 0
      ? turn0Supplement + mentionHint
      : mentionHint;

    const result = await claudeWithTools({
      system: systemPrompt({
        userName: resolved.displayName,
        userTimezone: resolved.timezone,
        persona: resolved.persona,
        now,
        pendingIntent,
        workflowSupplement: supplementForTurn || undefined,
        confirmationPending: turn === 0 && confirmationJustReceived,
      }),
      messages: state.messages,
      tools,
      model,
      maxTokens: 1024,
    });

    if (!result.ok) {
      await logActivity({
        workspaceId: resolved.workspaceId,
        userId: resolved.userId,
        senderPhone: senderKey,
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
      // Before accepting the final reply, check required tools were called.
      const required = workflow.requiredTools ?? [];
      if (required.length > 0 && !requiredToolMet && !requiredRetryDone) {
        // Inject a system nudge and give the agent one more turn.
        requiredRetryDone = true;
        const missingList = required.join(" or ");
        state.messages.push({
          role: "user",
          content: `[SYSTEM] You must call ${missingList} to answer this accurately. Call the tool now, then reply.`,
        });
        continue;
      }
      replyText = textOut.trim() || "Done.";
      // If this was a confirmation-gated intent and we just previewed, save pendingIntent.
      if (needsConfirmFirst) {
        pendingIntent = { intent: classification.intent, previewedAt: now.toISOString() };
      } else {
        pendingIntent = null;
      }
      break;
    }

    if (result.stopReason === "tool_use" && toolUses.length > 0) {
      const toolResults: ClaudeMessageContent[] = [];
      for (const call of toolUses) {
        // ── Allowlist enforcement ──────────────────────────────────────────
        const allowed = workflow.allowedTools;
        if (allowed && !allowed.includes(call.name)) {
          await logActivity({
            workspaceId: resolved.workspaceId,
            userId: resolved.userId,
            senderPhone: senderKey,
            direction: "tool",
            payload: { name: call.name, blocked: true, allowed },
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: JSON.stringify({
              ok: false,
              error: `Tool "${call.name}" is not available for this type of request.`,
            }),
            is_error: true,
          });
          continue;
        }

        toolCalls.push(call.name);

        // Track required tool satisfaction
        if ((workflow.requiredTools ?? []).includes(call.name)) {
          requiredToolMet = true;
        }

        const r = await executeTool(call.name, call.input, ctx);
        await logActivity({
          workspaceId: resolved.workspaceId,
          userId: resolved.userId,
          senderPhone: senderKey,
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

  await saveState(senderKey, resolved.workspaceId, resolved.userId, {
    messages: state.messages,
    pendingIntent,
  });
  await logActivity({
    workspaceId: resolved.workspaceId,
    userId: resolved.userId,
    senderPhone: senderKey,
    direction: "out",
    payload: {
      body: replyText,
      toolCalls,
      intent: classification.intent,
      model,
      toolCount: tools.length,
    },
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
