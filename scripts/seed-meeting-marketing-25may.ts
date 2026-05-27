#!/usr/bin/env tsx
/**
 * Capture the 2026-05-25 Joe ↔ Cousin "Marketing Move Venezuela" brainstorm
 * as a real meeting in the CRM. The 9 posada leads from batch-1 came out of
 * this same session, so this meeting is the upstream context for everything
 * we've already seeded.
 *
 *   tsx scripts/seed-meeting-marketing-25may.ts
 *
 * Idempotent — uses a stable meeting UUID.
 */
import "dotenv/config";
import { db, schema } from "@/db";

const WS = "11111111-2222-3333-4444-aaaaaaaaaaa1";
const JOE_ID = "11111111-2222-3333-4444-100000000001";
const COUSIN_ID = "22222222-cccc-cccc-cccc-000000000000";
const MEETING_ID = "33333333-3333-3333-3333-202605250001";

const AGENDA = "Marketing Move Venezuela — channel mix + tactics brainstorm";

const MINUTES = `Marketing Move Venezuela — channels + tactics

Channels:
  • Digital — ongoing, performance-focused
  • Ads spend — $100-200/month sustaining
  • Radio + Televisión — $1,000 placement(s)

Tactics:
  • Meet-and-greets — high-end, closed-doors, invite-only events
  • Product release moments as anchors
  • Guest speakers (industry know-how / behind-the-scenes)
  • Tool launches as press hooks
  • Partnerships: manufacturers + providers in the supply chain

Source: Joe's conversation with his cousin (name TBD), 2026-05-25. Same
session also surfaced the 8 posada leads now sitting on the Caney pipeline
(see contacts tagged via-joe-cousin).
`;

async function main() {
  const { meetings, meetingAttendees, touches, contacts } = schema;

  // 2026-05-25 at noon ET (UTC-4 EDT) — best-guess timestamp; Joe can edit later.
  const scheduledAt = new Date("2026-05-25T16:00:00.000Z");
  const endedAt = new Date("2026-05-25T17:30:00.000Z");

  await db
    .insert(meetings)
    .values({
      id: MEETING_ID,
      workspaceId: WS,
      createdBy: JOE_ID,
      title: "Joe ↔ Cousin · Marketing Move Venezuela brainstorm",
      scheduledAt,
      endedAt,
      type: "one_on_one",
      location: "Caracas (per Joe — confirm)",
      agenda: AGENDA,
      minutes: MINUTES,
      source: "manual",
      metAtTag: "family",
    })
    .onConflictDoNothing();
  console.log(`✓ Meeting "${"Joe ↔ Cousin · Marketing Move Venezuela brainstorm"}" stored`);

  await db
    .insert(meetingAttendees)
    .values({ meetingId: MEETING_ID, contactId: COUSIN_ID })
    .onConflictDoNothing();
  console.log("✓ Joe's Cousin attached as attendee");

  // Manually mirror the batch-encounter pattern: one touch on the cousin.
  await db.insert(touches).values({
    workspaceId: WS,
    createdBy: JOE_ID,
    contactId: COUSIN_ID,
    meetingId: MEETING_ID,
    channel: "meeting",
    body:
      "Marketing Move Venezuela brainstorm. Channel mix: Digital + ads ($100-200/mo) + Radio/TV ($1k). " +
      "Tactic: invite-only meet-and-greets pegged to product releases / tool launches / guest speakers / mfr+provider partnerships. " +
      "Same session surfaced 8 posada leads (now in CRM).",
    createdAt: scheduledAt,
  });

  // Bump cousin's last_touch_at so the freshness signal is correct.
  await db.execute(/* sql */ `
    update public.contacts
    set last_touch_at = '${scheduledAt.toISOString()}',
        updated_at = now()
    where id = '${COUSIN_ID}'
  `);
  console.log("✓ Touch logged on Joe's Cousin · last_touch_at bumped to 2026-05-25");

  console.log("\nDone. View at http://localhost:3000/meetings");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
