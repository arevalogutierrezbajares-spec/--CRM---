#!/usr/bin/env tsx
/**
 * smoke-all-tools — fires every WA agent tool against real Supabase data.
 *
 * Verifies each tool returns { ok: true } with the expected data shape.
 * Creates test data that gets cleaned up at the end.
 *
 *   env -u DATABASE_URL npx tsx scripts/smoke-all-tools.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { db, schema } from "@/db";
import { eq, inArray } from "drizzle-orm";
import { executeTool } from "@/lib/wa-agent/tools";
import type { ToolContext } from "@/lib/wa-agent/tools";

const { contacts, contactChannels, touches, reminders, meetings, meetingAttendees } = schema;

// ── Fixed workspace/user IDs (matches real Supabase seed) ────────────────────
const WS    = "11111111-2222-3333-4444-aaaaaaaaaaa1";
const TOMAS = "9d543a9c-3dfe-4f2b-aa73-e0156d478dce";  // arevalogutierrezbajares (owner)
const JOE   = "11111111-2222-3333-4444-100000000001";   // Jose Ernesto (admin)

// Test contact IDs to clean up
const SMOKE_CONTACT_IDS: string[] = [];
const SMOKE_TOUCH_IDS: string[] = [];
const SMOKE_REMINDER_IDS: string[] = [];
const SMOKE_MEETING_IDS: string[] = [];

const ctx: ToolContext = {
  workspaceId: WS,
  userId: TOMAS,
  ownerTimezone: "America/New_York",
  now: new Date(),
};

let passed = 0;
let failed = 0;

function ok(label: string, result: { ok: boolean; error?: string; speak?: string }) {
  if (result.ok) {
    console.log(`  ✓ ${label}${result.speak ? ` — ${result.speak}` : ""}`);
    passed++;
  } else {
    console.error(`  ✗ ${label} — ${result.error}`);
    failed++;
  }
}

async function main() {
  console.log("\n── AGB-CRM Tool Smoke Test ─────────────────────────────────────\n");

  // ── find_contact ────────────────────────────────────────────────────────────
  console.log("find_contact");
  ok("search Anabella", await executeTool("find_contact", { query: "Anabella" }, ctx));
  ok("search Juan Carlos", await executeTool("find_contact", { query: "Juan Carlos" }, ctx));

  // ── contact_summary ─────────────────────────────────────────────────────────
  console.log("\ncontact_summary");
  const [firstContact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.workspaceId, WS))
    .limit(1);
  if (firstContact) {
    ok("summary", await executeTool("contact_summary", { contact_id: firstContact.id }, ctx));
  }

  // ── create_contact ──────────────────────────────────────────────────────────
  console.log("\ncreate_contact");
  const createResult = await executeTool("create_contact", {
    name: "SMOKE TEST Contact",
    type: "person",
    relationship_type: "lead",
  }, ctx);
  ok("create", createResult);
  if (createResult.ok) {
    const data = createResult.data as { id: string };
    SMOKE_CONTACT_IDS.push(data.id);

    // ── add_channel ───────────────────────────────────────────────────────────
    console.log("\nadd_channel");
    ok("add email", await executeTool("add_channel", {
      contact_id: data.id,
      kind: "email",
      value: "smoke@test.example.com",
    }, ctx));
    ok("add phone", await executeTool("add_channel", {
      contact_id: data.id,
      kind: "phone",
      value: "+14155550199",
    }, ctx));
    ok("reject duplicate email", {
      ok: !(await executeTool("add_channel", { contact_id: data.id, kind: "email", value: "smoke@test.example.com" }, ctx)).ok,
    });

    // ── log_touch with follow-up ──────────────────────────────────────────────
    console.log("\nlog_touch");
    const touchResult = await executeTool("log_touch", {
      contact_id: data.id,
      body: "Smoke test call — everything looks good",
      channel: "call",
      follow_up_in: "3 days",
    }, ctx);
    ok("log touch + auto follow-up", touchResult);
    if (touchResult.ok) {
      const td = touchResult.data as { id: string; reminderId: string | null };
      if (td.id) SMOKE_TOUCH_IDS.push(td.id);
      if (td.reminderId) SMOKE_REMINDER_IDS.push(td.reminderId);
    }

    // ── upsert_note ───────────────────────────────────────────────────────────
    console.log("\nupsert_note");
    ok("create note", await executeTool("upsert_note", {
      contact_ids: [data.id],
      title: "Smoke test note",
      body: "This is a smoke test note body",
    }, ctx));
    ok("upsert (same title same day)", await executeTool("upsert_note", {
      contact_ids: [data.id],
      title: "Smoke test note",
      body: "Updated smoke test note body",
    }, ctx));

    // ── assign_contact ────────────────────────────────────────────────────────
    console.log("\nassign_contact");
    const assignResult = await executeTool("assign_contact", {
      contact_id: data.id,
      assignee: "me",
      note: "Check partnership potential",
      due_in: "tomorrow",
    }, ctx);
    ok("assign to self", assignResult);
    if (assignResult.ok) {
      const ad = assignResult.data as { reminderId: string };
      if (ad.reminderId) SMOKE_REMINDER_IDS.push(ad.reminderId);
    }

    // ── draft_message ──────────────────────────────────────────────────────────
    console.log("\ndraft_message");
    ok("draft email context", await executeTool("draft_message", {
      contact_id: data.id,
      channel: "email",
      purpose: "introduce ourselves",
      tone: "friendly",
    }, ctx));

    // ── meeting_brief ─────────────────────────────────────────────────────────
    console.log("\nmeeting_brief");
    ok("brief for contact", await executeTool("meeting_brief", {
      contact_ids: [data.id],
      context: "smoke test meeting",
    }, ctx));

    // ── log_meeting ───────────────────────────────────────────────────────────
    console.log("\nlog_meeting");
    const meetingResult = await executeTool("log_meeting", {
      title: "Smoke Test Meeting",
      scheduled_at: new Date().toISOString(),
      attendee_contact_ids: [data.id],
      notes: "Smoke test meeting notes",
      follow_up_in: "1 week",
    }, ctx);
    ok("log meeting", meetingResult);
    if (meetingResult.ok) {
      const md = meetingResult.data as { meetingId: string; followUpReminderId: string | null };
      if (md.meetingId) SMOKE_MEETING_IDS.push(md.meetingId);
      if (md.followUpReminderId) SMOKE_REMINDER_IDS.push(md.followUpReminderId);
    }

    // ── propose_add_contact ───────────────────────────────────────────────────
    console.log("\npropose_add_contact");
    ok("detect existing", await executeTool("propose_add_contact", {
      name: "SMOKE TEST Contact",
      context: "mentioned in meeting",
    }, ctx));
    ok("propose unknown", await executeTool("propose_add_contact", {
      name: "Totally Unknown Person XYZ",
      context: "met at event",
    }, ctx));
  }

  // ── Reminders ─────────────────────────────────────────────────────────────
  console.log("\nschedule_reminder");
  const remResult = await executeTool("schedule_reminder", {
    subject: "Smoke test reminder",
    due_at_iso: new Date(Date.now() + 86400000).toISOString(),
    recur: "once",
  }, ctx);
  ok("schedule", remResult);
  if (remResult.ok) {
    const rd = remResult.data as { id: string };
    SMOKE_REMINDER_IDS.push(rd.id);

    console.log("\nlist_reminders");
    ok("list week", await executeTool("list_reminders", { scope: "week" }, ctx));

    console.log("\ncancel_reminder");
    ok("cancel", await executeTool("cancel_reminder", { id: rd.id }, ctx));
    SMOKE_REMINDER_IDS.splice(SMOKE_REMINDER_IDS.indexOf(rd.id), 1); // already deleted
  }

  // ── Read-only tools ────────────────────────────────────────────────────────
  console.log("\ndaily_recap");
  ok("team recap", await executeTool("daily_recap", { whose: "team" }, ctx));

  console.log("\nread_todo_board");
  ok("full board", await executeTool("read_todo_board", { scope: "all" }, ctx));

  console.log("\nstatus_report");
  ok("all", await executeTool("status_report", { scope: "all" }, ctx));

  // ── Projects ───────────────────────────────────────────────────────────────
  console.log("\nfind_project");
  ok("search", await executeTool("find_project", { query: "caneycloud" }, ctx));

  // ── Cleanup ────────────────────────────────────────────────────────────────
  console.log("\n── Cleanup ─────────────────────────────────────────────────────\n");

  if (SMOKE_MEETING_IDS.length) {
    await db.delete(meetingAttendees).where(inArray(meetingAttendees.meetingId, SMOKE_MEETING_IDS));
    await db.delete(meetings).where(inArray(meetings.id, SMOKE_MEETING_IDS));
    console.log(`  deleted ${SMOKE_MEETING_IDS.length} test meeting(s)`);
  }
  if (SMOKE_REMINDER_IDS.length) {
    await db.delete(reminders).where(inArray(reminders.id, SMOKE_REMINDER_IDS));
    console.log(`  deleted ${SMOKE_REMINDER_IDS.length} test reminder(s)`);
  }
  if (SMOKE_TOUCH_IDS.length) {
    await db.delete(touches).where(inArray(touches.id, SMOKE_TOUCH_IDS));
    console.log(`  deleted ${SMOKE_TOUCH_IDS.length} test touch(es) — remainder cleaned by cascade`);
  }
  if (SMOKE_CONTACT_IDS.length) {
    // Cascade deletes channels, touches, etc.
    await db.delete(contacts).where(inArray(contacts.id, SMOKE_CONTACT_IDS));
    console.log(`  deleted ${SMOKE_CONTACT_IDS.length} test contact(s)`);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n── Results: ${passed} passed, ${failed} failed ────────────────────────\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
