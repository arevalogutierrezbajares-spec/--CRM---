#!/usr/bin/env tsx
/**
 * Caney leads batch 2 — Margarita hotels sourced from Joe's aunt.
 *   • H2O Margarita (Playa El Agua)
 *   • Hotel Miragua
 *   • Ikin Hotel
 *
 * Mirrors batch-1 structure: placeholder "Joe's Aunt (TBD)" intro node,
 * custom tag `via-joe-aunt`, caney tag, no pipeline projects yet, reminder
 * filed for Joe to backfill aunt's name + per-hotel context.
 *
 *   tsx scripts/seed-leads-batch-2-aunt.ts
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

const WS = "11111111-2222-3333-4444-aaaaaaaaaaa1";
const TOMAS_ID = "9d543a9c-3dfe-4f2b-aa73-e0156d478dce";
const JOE_ID = "11111111-2222-3333-4444-100000000001";

const AUNT_ID = "22222222-aaaa-aaaa-aaaa-000000000000";

const HOTELS = [
  {
    id: "22222222-aaaa-aaaa-aaaa-000000000001",
    name: "H2O Margarita",
    organization: "H2O Margarita",
    intro:
      "Hotel in Playa El Agua, Margarita. Owner/primary contact TBD. Via Joe's aunt.",
  },
  {
    id: "22222222-aaaa-aaaa-aaaa-000000000002",
    name: "Hotel Miragua",
    organization: "Hotel Miragua",
    intro: "Hotel in Margarita. Location detail + contact TBD. Via Joe's aunt.",
  },
  {
    id: "22222222-aaaa-aaaa-aaaa-000000000003",
    name: "Ikin Hotel",
    organization: "Ikin Hotel",
    intro: "Hotel in Margarita. Location detail + contact TBD. Via Joe's aunt.",
  },
];

async function main() {
  const { tags, contacts, contactTags, reminders } = schema;

  // ── Tags ────────────────────────────────────────────────────────────────
  const [caneyTag] = await db.select().from(tags).where(eq(tags.name, "caney")).limit(1);
  if (!caneyTag) throw new Error("'caney' tag missing — run db:seed first");

  await db.insert(tags).values({ name: "via-joe-aunt", kind: "custom" }).onConflictDoNothing();
  const [auntTag] = await db.select().from(tags).where(eq(tags.name, "via-joe-aunt")).limit(1);

  console.log(`Tags ready: caney=${caneyTag.id.slice(0, 8)}…  via-joe-aunt=${auntTag.id.slice(0, 8)}…\n`);

  // ── Joe's Aunt placeholder ──────────────────────────────────────────────
  await db
    .insert(contacts)
    .values({
      id: AUNT_ID,
      workspaceId: WS,
      createdBy: JOE_ID,
      name: "Joe's Aunt (name TBD)",
      type: "person",
      relationshipType: "partner",
      introChainFromText:
        "Source of the 3 Margarita hotel leads below. Joe's aunt — full name, WhatsApp, and her connection to each hotel all TBD. Reminder filed for Joe.",
    })
    .onConflictDoNothing();
  console.log("✓ Joe's Aunt (TBD) placeholder contact created\n");

  // ── Hotels ──────────────────────────────────────────────────────────────
  for (const h of HOTELS) {
    await db
      .insert(contacts)
      .values({
        id: h.id,
        workspaceId: WS,
        createdBy: JOE_ID,
        name: h.name,
        type: "org",
        organization: h.organization,
        relationshipType: "prospect",
        introChainFromContactId: AUNT_ID,
        introChainFromText: h.intro,
      })
      .onConflictDoNothing();
    for (const tagId of [caneyTag.id, auntTag.id]) {
      await db
        .insert(contactTags)
        .values({ contactId: h.id, tagId })
        .onConflictDoNothing();
    }
    console.log(`✓ ${h.name.padEnd(22)}  org    prospect  tags: caney/via-joe-aunt`);
  }

  // ── Reminder for Joe ────────────────────────────────────────────────────
  const due = new Date();
  due.setDate(due.getDate() + 1);
  due.setUTCHours(13, 0, 0, 0); // 9 AM ET
  await db.insert(reminders).values({
    workspaceId: WS,
    forUserId: JOE_ID,
    createdBy: TOMAS_ID,
    subject:
      "Backfill aunt: name + WhatsApp + per-hotel context on H2O Margarita (Playa El Agua), Hotel Miragua, Ikin Hotel. How does she know each one? Any owners she could intro?",
    dueAt: due,
    recur: "once",
    sourceContactId: AUNT_ID,
  });
  console.log(`\n✓ Reminder filed for Joe (due ${due.toISOString()})`);

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
