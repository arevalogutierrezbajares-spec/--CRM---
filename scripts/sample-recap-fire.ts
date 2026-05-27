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

async function main() {
  const inboundMessages = [
    "recap me on today's wins",
  ];

  for (const body of inboundMessages) {
    console.log("\n┌" + "─".repeat(72));
    console.log(`│ inbound from Joe (${JOE_PHONE}):`);
    console.log(`│   "${body}"`);
    console.log("├" + "─".repeat(72));

    const res = await handleMessage({ senderPhone: JOE_PHONE, body });

    if (!res.ok) {
      console.log(`│ ERROR: ${res.error}`);
      console.log(`│ reply: ${res.reply}`);
    } else {
      console.log(`│ tool calls : ${res.toolCalls.join(" → ") || "(none)"}`);
      console.log(`│ tokens     : ${res.tokensIn} in / ${res.tokensOut} out`);
      console.log("│");
      console.log("│ AGENT REPLY (what Joe would see on WhatsApp):");
      console.log("│");
      for (const line of res.reply.split("\n")) {
        console.log(`│   ${line}`);
      }
    }
    console.log("└" + "─".repeat(72));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
