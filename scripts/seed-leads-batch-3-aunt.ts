#!/usr/bin/env tsx
/**
 * Caney leads batch 3 — second wave from Joe's aunt.
 *   • La Guaquira hotel + Oscar Pietri (owner)
 *   • Anabella Guzman — "Viajando por Venezuela", connector who knows all the
 *     posadas → high-value relationship as a BD intro source, NOT a customer
 *   • Juan Carlos Guinand — ALREADY in (cousin batch); merge: add `via-joe-aunt`
 *     tag, set organization='Wao Turismo' (parent of Sitios WOW / Lomas de
 *     Caruao), note dual sourcing
 *
 *   tsx scripts/seed-leads-batch-3-aunt.ts
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

const WS = "11111111-2222-3333-4444-aaaaaaaaaaa1";
const JOE_ID = "11111111-2222-3333-4444-100000000001";

const AUNT_ID = "22222222-aaaa-aaaa-aaaa-000000000000";
const JCG_ID = "22222222-cccc-cccc-cccc-000000000001"; // existing from cousin batch

const GUAQUIRA_HOTEL_ID = "22222222-aaaa-aaaa-aaaa-000000000004";
const OSCAR_PIETRI_ID = "22222222-aaaa-aaaa-aaaa-000000000005";
const ANABELLA_ID = "22222222-aaaa-aaaa-aaaa-000000000006";

async function main() {
  const { tags, contacts, contactTags } = schema;

  const [caneyTag] = await db.select().from(tags).where(eq(tags.name, "caney")).limit(1);
  const [auntTag] = await db.select().from(tags).where(eq(tags.name, "via-joe-aunt")).limit(1);
  const [cousinTag] = await db.select().from(tags).where(eq(tags.name, "via-joe-cousin")).limit(1);

  // New `connector` tag — for people who are intro sources rather than targets.
  await db.insert(tags).values({ name: "connector", kind: "custom" }).onConflictDoNothing();
  const [connectorTag] = await db.select().from(tags).where(eq(tags.name, "connector")).limit(1);

  // ── 1. La Guaquira hotel ────────────────────────────────────────────────
  await db
    .insert(contacts)
    .values({
      id: GUAQUIRA_HOTEL_ID,
      workspaceId: WS,
      createdBy: JOE_ID,
      name: "La Guaquira",
      type: "org",
      organization: "La Guaquira",
      relationshipType: "prospect",
      introChainFromContactId: AUNT_ID,
      introChainFromText:
        "Hotel La Guaquira. Owner: Oscar Pietri. Location TBD. Via Joe's aunt.",
    })
    .onConflictDoNothing();
  for (const tagId of [caneyTag!.id, auntTag!.id]) {
    await db
      .insert(contactTags)
      .values({ contactId: GUAQUIRA_HOTEL_ID, tagId })
      .onConflictDoNothing();
  }
  console.log("✓ La Guaquira (org) seeded · caney/via-joe-aunt");

  // ── 2. Oscar Pietri (owner of La Guaquira) ──────────────────────────────
  await db
    .insert(contacts)
    .values({
      id: OSCAR_PIETRI_ID,
      workspaceId: WS,
      createdBy: JOE_ID,
      name: "Oscar Pietri",
      type: "person",
      organization: "La Guaquira",
      relationshipType: "lead",
      introChainFromContactId: AUNT_ID,
      introChainFromText:
        "Owner of La Guaquira hotel. Via Joe's aunt. WhatsApp + role detail TBD.",
    })
    .onConflictDoNothing();
  for (const tagId of [caneyTag!.id, auntTag!.id]) {
    await db
      .insert(contactTags)
      .values({ contactId: OSCAR_PIETRI_ID, tagId })
      .onConflictDoNothing();
  }
  console.log("✓ Oscar Pietri (person) seeded · caney/via-joe-aunt");

  // ── 3. Anabella Guzman — high-value connector ──────────────────────────
  await db
    .insert(contacts)
    .values({
      id: ANABELLA_ID,
      workspaceId: WS,
      createdBy: JOE_ID,
      name: "Anabella Guzman",
      type: "person",
      organization: "Viajando por Venezuela",
      relationshipType: "partner",
      introChainFromContactId: AUNT_ID,
      introChainFromText:
        "Runs 'Viajando por Venezuela'. Conoce todas las posadas — high-value " +
        "connector / BD intro source for the Venezuelan hospitality sector. NOT " +
        "a Caney target customer; rather a node that can unlock dozens of them. " +
        "Cultivate as a partner/advisor. Via Joe's aunt.",
    })
    .onConflictDoNothing();
  const anabellaTags = [caneyTag!.id, auntTag!.id];
  if (connectorTag) anabellaTags.push(connectorTag.id);
  for (const tagId of anabellaTags) {
    await db
      .insert(contactTags)
      .values({ contactId: ANABELLA_ID, tagId })
      .onConflictDoNothing();
  }
  console.log(
    "✓ Anabella Guzman (person · partner · CONNECTOR) seeded · caney/via-joe-aunt/connector",
  );

  // ── 4. Juan Carlos Guinand — MERGE update, not insert ───────────────────
  await db
    .update(contacts)
    .set({
      organization: "Wao Turismo",
      introChainFromText:
        "Operates Lomas de Caruao posada (under Sitios WOW property brand). " +
        "Parent business: Wao Turismo. DUAL-SOURCED: surfaced by both Joe's " +
        "cousin (2026-05-25 brainstorm) AND Joe's aunt — strong signal he's " +
        "well-connected in the VZLA hospitality scene. Prioritize.",
      updatedAt: new Date(),
    })
    .where(eq(contacts.id, JCG_ID));
  // Add via-joe-aunt tag alongside the existing via-joe-cousin
  await db
    .insert(contactTags)
    .values({ contactId: JCG_ID, tagId: auntTag!.id })
    .onConflictDoNothing();
  console.log(
    "✓ Juan Carlos Guinand MERGED · org=Wao Turismo · now tagged caney/via-joe-cousin/via-joe-aunt",
  );

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
