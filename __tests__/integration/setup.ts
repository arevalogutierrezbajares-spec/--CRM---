/**
 * Integration test setup: point the app at the local test Postgres, ensure a
 * known fake-user row exists, then truncate volatile tables before each test
 * file so tests don't pollute each other.
 *
 * The DB itself is created out-of-band via:
 *
 *   /opt/homebrew/opt/postgresql@18/bin/pg_ctl -D /tmp/agb-pg-data start
 *   DATABASE_URL=... drizzle-kit push
 *   DATABASE_URL=... tsx db/seed.ts
 *
 * — see scripts/test-db.sh.
 */
import { afterEach, beforeAll } from "vitest";
import { eq } from "drizzle-orm";

process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://agb@localhost:54329/agb_test";
// Force `development` so the dev-only fake-user bypass in lib/current-user.ts
// engages. Cannot fire in production (that file checks NODE_ENV explicitly).
(process.env as Record<string, string>).NODE_ENV = "development";
process.env.AGB_DEV_FAKE_USER = "1";
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "dummy";

// Must match the fake user id baked into lib/current-user.ts.
export const FAKE_USER_ID = "00000000-0000-0000-0000-000000000000";
// A workspace owned by FAKE_USER_ID, materialized in beforeAll.
export const FAKE_WORKSPACE_ID = "00000000-0000-0000-0000-0000000000aa";

beforeAll(async () => {
  const { db, schema } = await import("@/db");
  await db
    .insert(schema.users)
    .values({
      id: FAKE_USER_ID,
      email: "test@local",
      displayName: "Test Founder",
    })
    .onConflictDoNothing();
  await db
    .insert(schema.workspaces)
    .values({
      id: FAKE_WORKSPACE_ID,
      name: "Test Workspace",
      createdBy: FAKE_USER_ID,
    })
    .onConflictDoNothing();
  await db
    .insert(schema.workspaceMembers)
    .values({
      workspaceId: FAKE_WORKSPACE_ID,
      userId: FAKE_USER_ID,
      role: "owner",
    })
    .onConflictDoNothing();
  await db
    .update(schema.users)
    .set({ currentWorkspaceId: FAKE_WORKSPACE_ID })
    .where(eq(schema.users.id, FAKE_USER_ID));
});

afterEach(async () => {
  const { db } = await import("@/db");
  // Order matters: children before parents. Includes the WhatsApp agent
  // tables so each test starts with empty conversation state + no reminders.
  await db.execute(
    /* sql */ `
    truncate table
      email_audit_events,
      email_thread_crm_links,
      email_internal_notes,
      email_send_jobs,
      email_drafts,
      email_attachments,
      email_messages,
      email_threads,
      email_provisioning_requests,
      email_mailbox_access,
      email_mailboxes,
      email_provider_connections,
      wa_activity,
      wa_conversations,
      nudges,
      reminders,
      touches,
      action_item_initiatives,
      milestone_initiatives,
      meeting_attendees,
      meetings,
      milestones,
      initiatives,
      project_contacts,
      projects,
      contact_tags,
      contact_channels,
      contacts
    cascade
  `,
  );
});
