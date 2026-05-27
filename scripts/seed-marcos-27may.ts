#!/usr/bin/env tsx
/**
 * 2026-05-27 additions:
 *   1. New contact: Marcos Antonio Capote (BD candidate, VZLA experience,
 *      MBA Georgetown 2026) — Tomas-sourced
 *   2. Meeting Tomas ↔ Marcos scheduled for today, agenda set, minutes blank
 *      (Tomas to fill after)
 *   3. Touch logged on Marcos for the scheduled meeting
 *   4. Reminder for Joe — backfill ADDITIONAL contacts/resources surfaced in
 *      the 25-May cousin brainstorm beyond the 9 posada leads already in
 *   5. Reminder for Tomas — log meeting minutes + action items after the
 *      27-May Marcos meeting
 *
 *   tsx scripts/seed-marcos-27may.ts
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

const WS = "11111111-2222-3333-4444-aaaaaaaaaaa1";
const TOMAS_ID = "9d543a9c-3dfe-4f2b-aa73-e0156d478dce";
const JOE_ID = "11111111-2222-3333-4444-100000000001";
const COUSIN_ID = "22222222-cccc-cccc-cccc-000000000000";

const MARCOS_ID = "44444444-4444-4444-4444-202605270001";
const MEETING_ID = "33333333-3333-3333-3333-202605270001";

const MARCOS_INTRO =
  "Potential business-development partner/advisor. Deep operational experience in Venezuela. " +
  "Just completed MBA at Georgetown (2026). Tomas-sourced. First conversation scheduled 2026-05-27.";

const MEETING_AGENDA =
  "Tomas ↔ Marcos Antonio Capote · intro/explore · Marcos's VZLA experience + Georgetown MBA " +
  "+ where AGB ventures could leverage him (BD, advisory, intros).";

async function main() {
  const { contacts, contactTags, tags, meetings, meetingAttendees, touches, reminders } = schema;

  // ── 1. Marcos contact ────────────────────────────────────────────────────
  await db
    .insert(contacts)
    .values({
      id: MARCOS_ID,
      workspaceId: WS,
      createdBy: TOMAS_ID,
      name: "Marcos Antonio Capote",
      type: "person",
      relationshipType: "partner",
      introChainFromText: MARCOS_INTRO,
    })
    .onConflictDoNothing();
  console.log("✓ Marcos Antonio Capote contact created (partner · BD)");

  // Tag bd. (no caney/friend — he's cross-venture potential)
  const [bdTag] = await db.select().from(tags).where(eq(tags.name, "bd")).limit(1);
  if (bdTag) {
    await db
      .insert(contactTags)
      .values({ contactId: MARCOS_ID, tagId: bdTag.id })
      .onConflictDoNothing();
    console.log("✓ Tagged: bd");
  }

  // ── 2. Meeting today (placeholder noon ET) ──────────────────────────────
  const scheduledAt = new Date("2026-05-27T16:00:00.000Z"); // noon ET
  await db
    .insert(meetings)
    .values({
      id: MEETING_ID,
      workspaceId: WS,
      createdBy: TOMAS_ID,
      title: "Tomas ↔ Marcos Antonio Capote · intro",
      scheduledAt,
      endedAt: null, // Tomas fills in after
      type: "one_on_one",
      location: "TBD",
      agenda: MEETING_AGENDA,
      minutes: "",
      source: "manual",
      metAtTag: "tomas-network",
    })
    .onConflictDoNothing();
  await db
    .insert(meetingAttendees)
    .values({ meetingId: MEETING_ID, contactId: MARCOS_ID })
    .onConflictDoNothing();
  console.log("✓ Meeting 2026-05-27 noon ET scheduled · Marcos attached");

  // ── 3. Touch on Marcos for the meeting ──────────────────────────────────
  await db.insert(touches).values({
    workspaceId: WS,
    createdBy: TOMAS_ID,
    contactId: MARCOS_ID,
    meetingId: MEETING_ID,
    channel: "meeting",
    body:
      "Scheduled intro meeting. Agenda: explore where Marcos's VZLA operational chops + Georgetown MBA " +
      "could plug into AGB ventures (BD, advisory, intros). Minutes TBD post-meeting.",
    createdAt: scheduledAt,
  });
  await db.execute(/* sql */ `
    update public.contacts set last_touch_at = '${scheduledAt.toISOString()}', updated_at = now()
    where id = '${MARCOS_ID}'
  `);
  console.log("✓ Touch logged on Marcos · last_touch_at bumped to today");

  // ── 4. Reminder for Joe — additional cousin context ─────────────────────
  const joeDue = new Date();
  joeDue.setDate(joeDue.getDate() + 2);
  joeDue.setUTCHours(13, 0, 0, 0); // 9 AM ET
  await db.insert(reminders).values({
    workspaceId: WS,
    forUserId: JOE_ID,
    createdBy: TOMAS_ID,
    subject:
      "Backfill ADDITIONAL contacts/resources from the 2026-05-25 cousin brainstorm beyond the 9 posada leads already in (any people, vendors, providers, mfrs, marketing partners he mentioned).",
    dueAt: joeDue,
    recur: "once",
    sourceContactId: COUSIN_ID,
  });
  console.log(`✓ Reminder filed for Joe (due ${joeDue.toISOString()})`);

  // ── 5. Reminder for Tomas — log meeting minutes ─────────────────────────
  const tomasDue = new Date();
  tomasDue.setUTCHours(22, 0, 0, 0); // 6 PM ET today
  await db.insert(reminders).values({
    workspaceId: WS,
    forUserId: TOMAS_ID,
    createdBy: TOMAS_ID,
    subject:
      "Log minutes + action items from today's intro meeting with Marcos Antonio Capote (BD candidate, Georgetown MBA, VZLA exp).",
    dueAt: tomasDue,
    recur: "once",
    sourceContactId: MARCOS_ID,
  });
  console.log(`✓ Reminder filed for Tomas (due ${tomasDue.toISOString()})`);

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
