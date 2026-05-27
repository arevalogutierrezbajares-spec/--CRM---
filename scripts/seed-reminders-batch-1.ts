#!/usr/bin/env tsx
/**
 * File the three deferred data-capture action items as reminders on Tomas's
 * personal queue. These represent CRM data that exists in Tomas's head but
 * isn't materialized yet — the reminders will fire over WhatsApp so they
 * don't slip.
 *
 *   tsx scripts/seed-reminders-batch-1.ts
 */
import "dotenv/config";
import { db, schema } from "@/db";

const WS = "11111111-2222-3333-4444-aaaaaaaaaaa1";
const TOMAS_ID = "9d543a9c-3dfe-4f2b-aa73-e0156d478dce";

function at9amET(daysFromNow: number): Date {
  // 9 AM Eastern = 13:00 UTC during EDT (Mar–Nov). Today is 2026-05-27 → EDT.
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setUTCHours(13, 0, 0, 0);
  return d;
}

async function main() {
  const { reminders } = schema;

  const items = [
    {
      subject:
        "Gather WhatsApp + email for the 9 Joe's-cousin posada leads (Juan Carlos, La Gaviota, Nacho, Lidio, Play Los Roques, Casa Turquesa, Kira, Elias, Rafael). Even partial is fine — paste in chat.",
      dueAt: at9amET(1),
    },
    {
      subject:
        "Add existing CaneyCloud customers to CRM (live posadas already onboarded or in pilot). Per customer: name, location, when they signed, who runs it, current status (happy / churning / expanding).",
      dueAt: at9amET(3),
    },
    {
      subject:
        "Add personal advisors + board + investors to CRM as friend/partner contacts so the stale-friends watchdog can flag them at 60d. Even first names + 'how I know them' is enough to start.",
      dueAt: at9amET(7),
    },
  ];

  for (const item of items) {
    await db.insert(reminders).values({
      workspaceId: WS,
      forUserId: TOMAS_ID,
      createdBy: TOMAS_ID,
      subject: item.subject,
      dueAt: item.dueAt,
      recur: "once",
    });
    console.log(
      `✓ Reminder filed for Tomas (due ${item.dueAt.toISOString()}): ${item.subject.slice(0, 70)}…`,
    );
  }

  console.log("\n3 reminders queued on Tomas's personal queue.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
