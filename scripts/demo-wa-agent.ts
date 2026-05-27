#!/usr/bin/env tsx
/**
 * Drive the WhatsApp agent against the local Postgres + seeded data.
 * Stubs Claude with a scripted sequence of tool calls so we can prove the
 * end-to-end agent path works without burning real API quota.
 *
 *   DATABASE_URL=... tsx scripts/demo-wa-agent.ts
 */
import "dotenv/config";
import { db, schema } from "@/db";
import { handleMessage } from "@/lib/whatsapp-agent";
import { eq } from "drizzle-orm";

const FAKE_USER_ID = "00000000-0000-0000-0000-000000000000";
const FAKE_WORKSPACE_ID = "00000000-0000-0000-0000-0000000000aa";
const SENDER = "+15551234567";

process.env.ANTHROPIC_API_KEY = "sk-test";
(process.env as Record<string, string>).NODE_ENV = "development";
process.env.AGB_DEV_FAKE_USER = "1";

const realFetch = globalThis.fetch;

function scriptClaude(
  responses: Array<{
    stop_reason: "tool_use" | "end_turn";
    content: Array<
      | { type: "text"; text: string }
      | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
    >;
  }>,
) {
  let i = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("api.anthropic.com/v1/messages")) {
      const r = responses[i++];
      return new Response(
        JSON.stringify({
          id: `msg_${i}`,
          stop_reason: r.stop_reason,
          content: r.content,
          usage: { input_tokens: 1200, output_tokens: 80 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return realFetch(input);
  }) as typeof fetch;
}

async function step(label: string, message: string) {
  console.log(`\n┌─ ${label}`);
  console.log(`│ User:  ${message}`);
  const res = await handleMessage({
    senderPhone: SENDER,
    body: message,
  });
  console.log(`│ Bot:   ${res.ok ? res.reply : "(error) " + res.reply}`);
  if (res.ok) {
    console.log(`│ Tools: ${res.toolCalls.join(" → ") || "(none)"}`);
    console.log(`│ Tokens: ${res.tokensIn} in · ${res.tokensOut} out`);
  }
  console.log("└─");
}

async function main() {
// Make sure FAKE_USER has a whatsapp_phone matching SENDER so resolveSender finds them.
await db
  .update(schema.users)
  .set({ whatsappPhone: SENDER, currentWorkspaceId: FAKE_WORKSPACE_ID })
  .where(eq(schema.users.id, FAKE_USER_ID));

const [marta] = await db
  .select()
  .from(schema.contacts)
  .where(eq(schema.contacts.name, "Marta López"))
  .limit(1);
const [martaProject] = await db
  .select()
  .from(schema.projects)
  .where(eq(schema.projects.title, "Marta — Caney onboarding"))
  .limit(1);

if (!marta || !martaProject) {
  console.error("Seed not found — run scripts/seed-demo.ts first");
  process.exit(1);
}

console.log("Demo data:");
console.log("  Marta contact:", marta.id);
console.log("  Marta project:", martaProject.id);
console.log("");

// ─── Flow 1: find + log touch ───────────────────────────────────────────────
scriptClaude([
  {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: "a", name: "find_contact", input: { query: "Marta" } }],
  },
  {
    stop_reason: "tool_use",
    content: [
      {
        type: "tool_use",
        id: "b",
        name: "log_touch",
        input: {
          contact_id: marta.id,
          channel: "whatsapp",
          body: "Just confirmed she's ready for the October pilot start",
        },
      },
    ],
  },
  {
    stop_reason: "end_turn",
    content: [{ type: "text", text: "✓ Logged on Marta — she's ready for October pilot." }],
  },
]);
await step("Flow 1: log a touch", "Just talked to Marta, she's ready for October pilot start");

// ─── Flow 2: status report ───────────────────────────────────────────────────
scriptClaude([
  {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: "s", name: "status_report", input: { scope: "all" } }],
  },
  {
    stop_reason: "end_turn",
    content: [
      {
        type: "text",
        text: "You've got overdue milestones on the Marta project, a blocked VAV deal waiting on Diego, and Carlos has gone stale (70+ days).",
      },
    ],
  },
]);
await step("Flow 2: status", "What's overdue?");

// ─── Flow 3: schedule a reminder ────────────────────────────────────────────
scriptClaude([
  {
    stop_reason: "tool_use",
    content: [
      {
        type: "tool_use",
        id: "r",
        name: "schedule_reminder",
        input: {
          subject: "Send Diego the deliverables agreement v2",
          due_at_iso: new Date(Date.now() + 2 * 86400000).toISOString(),
          recur: "once",
        },
      },
    ],
  },
  {
    stop_reason: "end_turn",
    content: [{ type: "text", text: "✓ Reminder set for 2 days from now." }],
  },
]);
await step("Flow 3: schedule reminder", "Remind me in 2 days to send Diego the agreement v2");

// ─── Flow 4: list reminders ─────────────────────────────────────────────────
scriptClaude([
  {
    stop_reason: "tool_use",
    content: [
      {
        type: "tool_use",
        id: "l",
        name: "list_reminders",
        input: { scope: "week" },
      },
    ],
  },
  {
    stop_reason: "end_turn",
    content: [
      {
        type: "text",
        text: "You have 3 reminders this week: WhatsApp spec for Marta, Diego's agreement, and the Monday VAV review.",
      },
    ],
  },
]);
await step("Flow 4: list reminders", "What's on the calendar this week?");

// ─── Verify side effects ────────────────────────────────────────────────────
console.log("\n=== DB side effects ===\n");

const newTouch = await db
  .select()
  .from(schema.touches)
  .where(eq(schema.touches.contactId, marta.id));
console.log(`Touches on Marta: ${newTouch.length}`);
const lastTouch = newTouch.sort(
  (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
)[0];
console.log(`  Latest: "${lastTouch.body.slice(0, 80)}"`);

const allReminders = await db.select().from(schema.reminders);
console.log(`\nReminders in DB: ${allReminders.length}`);
allReminders.slice(0, 5).forEach((r) => {
  console.log(`  • ${r.subject} (${r.recur}) due ${r.dueAt.toISOString()}`);
});

const activity = await db.select().from(schema.waActivity);
const byDir: Record<string, number> = {};
for (const a of activity) byDir[a.direction] = (byDir[a.direction] ?? 0) + 1;
console.log(`\nwa_activity log: ${activity.length} rows`);
console.log(
  `  by direction:`,
  Object.entries(byDir)
    .map(([k, v]) => `${k}=${v}`)
    .join(", "),
);

const tokens = activity.reduce(
  (acc, a) => ({
    in: acc.in + (a.tokensIn ?? 0),
    out: acc.out + (a.tokensOut ?? 0),
  }),
  { in: 0, out: 0 },
);
console.log(`  tokens: ${tokens.in} in / ${tokens.out} out`);

const [conv] = await db
  .select()
  .from(schema.waConversations)
  .where(eq(schema.waConversations.senderPhone, SENDER));
console.log(
  `\nConversation state: ${conv ? `${(conv.messages as unknown[]).length} messages persisted` : "(none)"}`,
);

console.log("\n✓ All 4 flows ran end-to-end against real Postgres.");
globalThis.fetch = realFetch;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
