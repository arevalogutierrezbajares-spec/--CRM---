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

process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://agb@localhost:54329/agb_test";
// Force `development` so the dev-only fake-user bypass in lib/current-user.ts
// engages. Cannot fire in production (that file checks NODE_ENV explicitly).
process.env.NODE_ENV = "development";
process.env.AGB_DEV_FAKE_USER = "1";
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "dummy";

// Must match the fake user id baked into lib/current-user.ts.
export const FAKE_USER_ID = "00000000-0000-0000-0000-000000000000";

beforeAll(async () => {
  const { db, schema } = await import("@/db");
  // Make sure the fake test user exists — every FK on contacts/projects/etc
  // needs a row in users.
  await db
    .insert(schema.users)
    .values({
      id: FAKE_USER_ID,
      email: "test@local",
      displayName: "Test Founder",
    })
    .onConflictDoNothing();
});

afterEach(async () => {
  const { db } = await import("@/db");
  // Order matters: children before parents.
  await db.execute(
    /* sql */ `
    truncate table
      touches,
      meeting_attendees,
      meetings,
      milestones,
      project_contacts,
      projects,
      contact_tags,
      contact_channels,
      contacts
    cascade
  `,
  );
});
