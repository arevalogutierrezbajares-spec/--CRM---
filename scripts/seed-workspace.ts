#!/usr/bin/env tsx
/**
 * One-shot: bootstrap the real "Arevalo Gutierrez Bajares" workspace +
 * its two operating members (Tomas + Jose Ernesto) with their WhatsApp
 * numbers and the per-user persona instructions the agent uses to greet
 * them. Idempotent — safe to re-run.
 *
 *   tsx scripts/seed-workspace.ts
 *
 * Notes on identity:
 *   - Tomas is linked to the Supabase auth user that already signed in
 *     (auth.users → arevalogutierrezbajares@gmail.com).
 *   - Jose Ernesto is created with a placeholder email
 *     ("+16466752101@whatsapp.local") because he hasn't signed in yet.
 *     When he does sign in via Supabase auth, his real auth.uid will land
 *     in public.users via ensureUserAndWorkspace — at that point migrate
 *     his workspace_members + content from the stub row, then delete the
 *     stub. See HANDOFF.md for the manual reconcile recipe.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

const TOMAS_USER_ID = "9d543a9c-3dfe-4f2b-aa73-e0156d478dce"; // existing auth.users row
const TOMAS_EMAIL = "arevalogutierrezbajares@gmail.com";

const JOE_USER_ID = "11111111-2222-3333-4444-100000000001";
const JOE_EMAIL = "+16466752101@whatsapp.local";

const WORKSPACE_ID = "11111111-2222-3333-4444-aaaaaaaaaaa1";

const TOMAS_PERSONA =
  "User is Tomas. Pick a nickname for each reply based on mood/context: " +
  "Top G, TG, Master Tomas, TIGER, El Tigre. Mix them up — don't pick the " +
  "same one twice in a row. Bias toward TIGER / El Tigre when celebrating, " +
  "Master Tomas for serious work, TG/Top G for casual one-liners.";

const JOE_PERSONA =
  "User is Jose Ernesto. Pick a nickname for each reply based on mood/context: " +
  "Sir Joe, Master Joe, Joe, Mr. Joe, Jose. Mix them up. Bias toward Sir Joe / " +
  "Master Joe in deferential/formal moments, Joe / Mr. Joe for everyday, Jose " +
  "for direct-and-warm.";

const { users, workspaces, workspaceMembers } = schema;

async function main() {
  console.log("Seeding workspace + members...");

  // 1. Tomas — upsert by id (matches auth.uid).
  await db
    .insert(users)
    .values({
      id: TOMAS_USER_ID,
      email: TOMAS_EMAIL,
      displayName: "Tomas",
      timezone: "America/New_York",
      whatsappPhone: "+19545317093",
      whatsappPersona: TOMAS_PERSONA,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: TOMAS_EMAIL,
        displayName: "Tomas",
        whatsappPhone: "+19545317093",
        whatsappPersona: TOMAS_PERSONA,
      },
    });
  console.log("  ✓ Tomas (+19545317093) upserted");

  // 2. Joe — placeholder row keyed by a synthetic email so future auth
  //    sign-in lands on a separate row (manual reconcile path).
  await db
    .insert(users)
    .values({
      id: JOE_USER_ID,
      email: JOE_EMAIL,
      displayName: "Jose Ernesto",
      timezone: "America/New_York",
      whatsappPhone: "+16466752101",
      whatsappPersona: JOE_PERSONA,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        displayName: "Jose Ernesto",
        whatsappPhone: "+16466752101",
        whatsappPersona: JOE_PERSONA,
      },
    });
  console.log("  ✓ Jose Ernesto (+16466752101) upserted");

  // 3. Workspace
  await db
    .insert(workspaces)
    .values({
      id: WORKSPACE_ID,
      name: "Arevalo Gutierrez Bajares",
      createdBy: TOMAS_USER_ID,
    })
    .onConflictDoUpdate({
      target: workspaces.id,
      set: { name: "Arevalo Gutierrez Bajares" },
    });
  console.log("  ✓ Workspace 'Arevalo Gutierrez Bajares' upserted");

  // 4. Memberships
  await db
    .insert(workspaceMembers)
    .values({ workspaceId: WORKSPACE_ID, userId: TOMAS_USER_ID, role: "owner" })
    .onConflictDoNothing();
  await db
    .insert(workspaceMembers)
    .values({ workspaceId: WORKSPACE_ID, userId: JOE_USER_ID, role: "admin" })
    .onConflictDoNothing();
  console.log("  ✓ Tomas = owner, Joe = admin");

  // 5. Point both users at the new workspace as their default.
  await db
    .update(users)
    .set({ currentWorkspaceId: WORKSPACE_ID })
    .where(eq(users.id, TOMAS_USER_ID));
  await db
    .update(users)
    .set({ currentWorkspaceId: WORKSPACE_ID })
    .where(eq(users.id, JOE_USER_ID));
  console.log("  ✓ Both members default to this workspace");

  console.log("\nDone. Both numbers can now text the WhatsApp agent.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
