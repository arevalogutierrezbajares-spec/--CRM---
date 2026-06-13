#!/usr/bin/env tsx
/**
 * One-off backfill: give every pre-existing call recording a Meeting.
 *
 * Recordings filed before the recording↔meeting link existed have
 * meeting_id = NULL — they never appeared in the meeting module. This creates a
 * Meeting (type='call', source='voice') for each, attaches the matched contact
 * as an attendee (when contact_id is set), and back-links the recording.
 *
 *   env -u DATABASE_URL npx tsx scripts/backfill-recording-meetings.ts          # dry run
 *   env -u DATABASE_URL npx tsx scripts/backfill-recording-meetings.ts --apply  # write
 *
 * Idempotent: only touches rows where meeting_id IS NULL. Re-running after a
 * partial run picks up exactly the remaining rows. Existing 'call' touches are
 * NOT retro-linked (matching the right touch is ambiguous) — only new meetings
 * carry the link going forward.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { createCallMeeting } from "@/db/queries/meetings";

const { callRecordings } = schema;

async function main() {
  const apply = process.argv.includes("--apply");

  const rows = await db
    .select({
      id: callRecordings.id,
      workspaceId: callRecordings.workspaceId,
      createdBy: callRecordings.createdBy,
      title: callRecordings.title,
      brief: callRecordings.brief,
      durationSecs: callRecordings.durationSecs,
      contactId: callRecordings.contactId,
      createdAt: callRecordings.createdAt,
    })
    .from(callRecordings)
    .where(isNull(callRecordings.meetingId));

  console.log(
    `${rows.length} recording(s) without a meeting${apply ? "" : " (dry run — pass --apply to write)"}`,
  );
  if (rows.length === 0) return;

  let done = 0;
  for (const r of rows) {
    const label = `${r.title}  [${r.id.slice(0, 8)}]${r.contactId ? "  +contact" : ""}`;
    if (!apply) {
      console.log(`  would link → ${label}`);
      continue;
    }
    const meetingId = await createCallMeeting({
      workspaceId: r.workspaceId,
      createdBy: r.createdBy,
      title: r.title,
      minutes: r.brief ?? null,
      occurredAt: r.createdAt,
      durationSecs: r.durationSecs,
      contactId: r.contactId,
    });
    await db
      .update(callRecordings)
      .set({ meetingId })
      .where(
        and(
          eq(callRecordings.id, r.id),
          isNull(callRecordings.meetingId), // guard against a concurrent run
        ),
      );
    done++;
    console.log(`  linked → ${label}  → meeting ${meetingId.slice(0, 8)}`);
  }
  console.log(apply ? `\nDone. ${done} recording(s) linked.` : "");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
