#!/usr/bin/env tsx
/**
 * SAMPLE FIRE — simulate Joe texting the WhatsApp agent "recap me on today"
 * end-to-end against the real Supabase data + real Claude API. No Meta hop
 * is involved; we just drive the agent loop directly.
 *
 *   tsx scripts/sample-recap-fire.ts
 */
import "dotenv/config";
import { handleMessage } from "@/lib/whatsapp-agent";

const JOE_PHONE = "+16466752101";
const TOMAS_PHONE = "+19545317093";

async function fire(label: string, phone: string, body: string) {
  console.log("\n┌" + "─".repeat(72));
  console.log(`│ inbound from ${label} (${phone}):`);
  console.log(`│   "${body}"`);
  console.log("├" + "─".repeat(72));

  const res = await handleMessage({ senderPhone: phone, body });

  if (!res.ok) {
    console.log(`│ ERROR: ${res.error}`);
    console.log(`│ reply: ${res.reply}`);
  } else {
    console.log(`│ tool calls : ${res.toolCalls.join(" → ") || "(none)"}`);
    console.log(`│ tokens     : ${res.tokensIn} in / ${res.tokensOut} out`);
    console.log("│");
    console.log(`│ AGENT REPLY (what ${label} would see on WhatsApp):`);
    console.log("│");
    for (const line of res.reply.split("\n")) {
      console.log(`│   ${line}`);
    }
  }
  console.log("└" + "─".repeat(72));
}

async function main() {
  await fire("Joe", JOE_PHONE, "recap me on today's wins");
  await fire("Tomas", TOMAS_PHONE, "recap today");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
