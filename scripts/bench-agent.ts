#!/usr/bin/env tsx
/**
 * bench-agent — fire representative messages through the WA agent loop and
 * measure tokens + quality.
 *
 *   env -u DATABASE_URL npx tsx scripts/bench-agent.ts
 *
 * Calls handleMessage() directly — no WhatsApp delivery happens. The agent
 * makes REAL Anthropic + DB calls (cheap: each test ~$0.001-0.005).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { handleMessage } from "@/lib/wa-agent/loop";
import { classifyIntent } from "@/lib/wa-agent/intent/classify";
import { getWorkflow } from "@/lib/wa-agent/intent/workflows";
import { TOOL_DEFINITIONS } from "@/lib/wa-agent/tools";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const { waConversations } = schema;

// Tomas — registered with whatsapp_phone = '+19545317093'
const SENDER = "19545317093";

// Test cases — representative across all intents
const TESTS = [
  { body: "hi", expectIntent: "unknown" },
  { body: "my todos", expectIntent: "todo_query" },
  { body: "who is anabella", expectIntent: "contact_find" },
  { body: "recap", expectIntent: "recap" },
  { body: "my reminders", expectIntent: "reminder_list" },
  { body: "brief me on anabella before my call", expectIntent: "meeting_brief" },
  { body: "talked to anabella, she's open to a connector intro", expectIntent: "touch_log" },
  { body: "note that oscar is interested in the BD partnership", expectIntent: "note_write" },
  { body: "remind me to call oscar tomorrow at 10am", expectIntent: "reminder_set" },
  { body: "draft an email to anabella to follow up", expectIntent: "draft_send" },
];

type Result = {
  body: string;
  expectIntent: string;
  actualIntent: string;
  intentOk: boolean;
  model: string;
  toolCount: number;
  toolsAvailable: number;
  tokensIn: number;
  tokensOut: number;
  toolCalls: string[];
  reply: string;
  estimatedBeforeIn: number; // tokens if we'd sent all 20 tools
};

const TOOL_DEFS_FULL_JSON = JSON.stringify(TOOL_DEFINITIONS);
const FULL_TOOL_TOKENS = Math.ceil(TOOL_DEFS_FULL_JSON.length / 4);

async function resetConversation() {
  await db
    .delete(waConversations)
    .where(eq(waConversations.senderPhone, SENDER));
}

async function runOne(body: string, expectIntent: string): Promise<Result> {
  await resetConversation();

  const classification = classifyIntent(body);
  const workflow = getWorkflow(classification.intent);
  const allowedNames = workflow.allowedTools;
  const tools = allowedNames
    ? TOOL_DEFINITIONS.filter((t) => allowedNames.includes(t.name))
    : TOOL_DEFINITIONS;
  const toolsJsonLen = JSON.stringify(tools).length;
  const toolTokensActual = Math.ceil(toolsJsonLen / 4);

  const result = await handleMessage({ senderPhone: SENDER, body });

  const reply = result.ok ? result.reply : `ERROR: ${result.error}`;
  const tokensIn = result.ok ? result.tokensIn : 0;
  const tokensOut = result.ok ? result.tokensOut : 0;
  const toolCalls = result.ok ? result.toolCalls : [];

  // Estimate what tokens_in would have been if we'd shipped all 20 tools.
  // Subtract the actual tool tokens, add the full toolset estimate.
  const estimatedBeforeIn = tokensIn - toolTokensActual + FULL_TOOL_TOKENS;

  return {
    body,
    expectIntent,
    actualIntent: classification.intent,
    intentOk: classification.intent === expectIntent,
    model: workflow.model ?? "claude-sonnet-4-6",
    toolCount: tools.length,
    toolsAvailable: TOOL_DEFINITIONS.length,
    tokensIn,
    tokensOut,
    toolCalls,
    reply,
    estimatedBeforeIn,
  };
}

async function main() {
  console.log("\n── WA agent bench ───────────────────────────────────────────\n");
  console.log(`Full toolset JSON: ${TOOL_DEFS_FULL_JSON.length} chars ≈ ${FULL_TOOL_TOKENS} tokens\n`);

  const results: Result[] = [];

  for (const t of TESTS) {
    process.stdout.write(`  ${t.body.padEnd(60)} … `);
    try {
      const r = await runOne(t.body, t.expectIntent);
      results.push(r);
      const tag = r.intentOk ? "✓" : "✗";
      const modelShort = r.model.replace("claude-", "").replace("-4-", "-");
      console.log(`${tag} ${modelShort.padEnd(10)} ${r.toolCount}/${r.toolsAvailable} tools  ${r.tokensIn}→${r.tokensOut} tok`);
    } catch (e) {
      console.log(`FATAL: ${(e as Error).message}`);
    }
    // Pace requests so we don't hammer the rate limit
    await new Promise((r) => setTimeout(r, 1500));
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n── Detail ──\n");
  for (const r of results) {
    console.log(`▸ "${r.body}"`);
    console.log(`  intent: ${r.actualIntent}${r.intentOk ? "" : ` (expected ${r.expectIntent})`}`);
    console.log(`  model: ${r.model}`);
    console.log(`  tools available: ${r.toolCount}/${r.toolsAvailable}`);
    console.log(`  tool calls: ${r.toolCalls.length ? r.toolCalls.join(", ") : "(none)"}`);
    console.log(`  tokens in/out: ${r.tokensIn} / ${r.tokensOut}`);
    console.log(`  est. before diet: ~${r.estimatedBeforeIn} in  (saved ~${r.estimatedBeforeIn - r.tokensIn})`);
    console.log(`  reply: ${r.reply.replace(/\n/g, " ").slice(0, 140)}${r.reply.length > 140 ? "…" : ""}`);
    console.log();
  }

  // ── Totals ──
  const sonnet = results.filter((r) => r.model.includes("sonnet"));
  const haiku = results.filter((r) => r.model.includes("haiku"));
  const sumIn = results.reduce((a, r) => a + r.tokensIn, 0);
  const sumOut = results.reduce((a, r) => a + r.tokensOut, 0);
  const sumBefore = results.reduce((a, r) => a + r.estimatedBeforeIn, 0);
  console.log("── Totals ──");
  console.log(`Tests:      ${results.length}  (${sonnet.length} sonnet, ${haiku.length} haiku)`);
  console.log(`Intent OK:  ${results.filter((r) => r.intentOk).length}/${results.length}`);
  console.log(`Tokens in:  ${sumIn}  (was ~${sumBefore} before diet → saved ${sumBefore - sumIn}, ${Math.round((1 - sumIn / sumBefore) * 100)}%)`);
  console.log(`Tokens out: ${sumOut}`);
  console.log(`Sonnet only: ${sonnet.reduce((a, r) => a + r.tokensIn, 0)} in  (this counts against the 30K/min limit)`);
  console.log();

  await resetConversation();
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
