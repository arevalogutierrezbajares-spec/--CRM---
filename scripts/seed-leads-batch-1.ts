#!/usr/bin/env tsx
/**
 * Seed the first batch of CaneyCloud posada leads sourced from Joe's cousin.
 * Idempotent — uses stable UUIDs + ON CONFLICT DO NOTHING. Re-running won't
 * duplicate. Names + intro chain only; phones, channels, and pipeline
 * projects added in later batches.
 *
 *   tsx scripts/seed-leads-batch-1.ts
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

const WS = "11111111-2222-3333-4444-aaaaaaaaaaa1"; // Arevalo Gutierrez Bajares
const TOMAS_ID = "9d543a9c-3dfe-4f2b-aa73-e0156d478dce";
const JOE_ID = "11111111-2222-3333-4444-100000000001";

const { tags, contacts, contactTags, reminders } = schema;

// Stable UUIDs so re-runs are idempotent.
const COUSIN_ID = "22222222-cccc-cccc-cccc-000000000000";

type Lead = {
  id: string;
  name: string;
  type: "person" | "org";
  organization: string | null;
  relationship: "lead" | "prospect" | "friend" | "partner";
  intro: string;
  extraTags: string[]; // beyond caney + via-joe-cousin
};

const LEADS: Lead[] = [
  {
    id: "22222222-cccc-cccc-cccc-000000000001",
    name: "Juan Carlos Guinand",
    type: "person",
    organization: "Sitios WOW",
    relationship: "lead",
    intro:
      "Operates Lomas de Caruao posada. Lead intro via Joe's cousin (name TBD).",
    extraTags: [],
  },
  {
    id: "22222222-cccc-cccc-cccc-000000000002",
    name: "La Gaviota",
    type: "org",
    organization: "La Gaviota",
    relationship: "prospect",
    intro:
      "Posada in Los Roques. Owner/primary contact TBD. Via Joe's cousin.",
    extraTags: [],
  },
  {
    id: "22222222-cccc-cccc-cccc-000000000003",
    name: "Nacho",
    type: "person",
    organization: null,
    relationship: "lead",
    intro:
      "Operates a property in Morrocoy. Full name + last name TBD. Via Joe's cousin.",
    extraTags: [],
  },
  {
    id: "22222222-cccc-cccc-cccc-000000000004",
    name: "Lidio Hotel",
    type: "org",
    organization: "Lidio Hotel",
    relationship: "prospect",
    intro:
      "Hotel — location TBD. Owner/primary contact (likely 'Lidio') TBD. Via Joe's cousin.",
    extraTags: [],
  },
  {
    id: "22222222-cccc-cccc-cccc-000000000005",
    name: "Play Los Roques",
    type: "org",
    organization: "Play Los Roques",
    relationship: "prospect",
    intro:
      "Posada in Los Roques. Owner/primary contact TBD. Via Joe's cousin.",
    extraTags: [],
  },
  {
    id: "22222222-cccc-cccc-cccc-000000000006",
    name: "Casa Turquesa",
    type: "org",
    organization: "Casa Turquesa",
    relationship: "prospect",
    intro: "Posada in Margarita. Owner/primary contact TBD. Via Joe's cousin.",
    extraTags: [],
  },
  {
    id: "22222222-cccc-cccc-cccc-000000000007",
    name: "Kira",
    type: "person",
    organization: null,
    relationship: "friend",
    intro:
      "Posada en Margarita. Amiga de Joyce y Patricia. Last name TBD. Surfaced via Joe's cousin.",
    extraTags: ["friend"],
  },
  {
    id: "22222222-cccc-cccc-cccc-000000000008",
    name: "Elias Atencio",
    type: "person",
    organization: "Campamento Canaima",
    relationship: "lead",
    intro:
      "Operates Campamento Canaima. Partner with Rafael Oliveros. Via Joe's cousin.",
    extraTags: [],
  },
  {
    id: "22222222-cccc-cccc-cccc-000000000009",
    name: "Rafael Oliveros",
    type: "person",
    organization: "Campamento Canaima",
    relationship: "lead",
    intro:
      "Socio de Elias Atencio. Co-operator of Campamento Canaima. Via Joe's cousin.",
    extraTags: [],
  },
];

async function main() {
  console.log("=== Caney leads batch 1 — Joe's cousin's posada intros ===\n");

  // 1. Tags — venture + custom marker for this provenance.
  const [caneyTag] = await db
    .select()
    .from(tags)
    .where(eq(tags.name, "caney"))
    .limit(1);
  if (!caneyTag) throw new Error("'caney' venture tag missing — run db:seed first");

  await db
    .insert(tags)
    .values({ name: "via-joe-cousin", kind: "custom" })
    .onConflictDoNothing();
  const [cousinTag] = await db
    .select()
    .from(tags)
    .where(eq(tags.name, "via-joe-cousin"))
    .limit(1);

  const [friendTag] = await db
    .select()
    .from(tags)
    .where(eq(tags.name, "friend"))
    .limit(1);

  console.log(
    `Tags ready: caney=${caneyTag.id.slice(0, 8)}…  via-joe-cousin=${cousinTag.id.slice(0, 8)}…\n`,
  );

  // 2. Placeholder contact for Joe's cousin — the introducer node so we can
  //    materialize the intro chain. Joe will fill in name + WhatsApp later.
  await db
    .insert(contacts)
    .values({
      id: COUSIN_ID,
      workspaceId: WS,
      createdBy: JOE_ID,
      name: "Joe's Cousin (name TBD)",
      type: "person",
      relationshipType: "partner",
      introChainFromText:
        "Source of the 8 posada lead intros below. Joe's cousin — full name, WhatsApp, and his connection to each posada all TBD. Reminder filed for Joe.",
    })
    .onConflictDoNothing();
  console.log("✓ Joe's Cousin (TBD) placeholder contact created\n");

  // 3. Each lead — contact + tag links.
  for (const lead of LEADS) {
    await db
      .insert(contacts)
      .values({
        id: lead.id,
        workspaceId: WS,
        createdBy: JOE_ID,
        name: lead.name,
        type: lead.type,
        organization: lead.organization,
        relationshipType: lead.relationship,
        introChainFromContactId: COUSIN_ID,
        introChainFromText: lead.intro,
      })
      .onConflictDoNothing();

    // Tag with caney + via-joe-cousin always; friend conditionally.
    const wantTags = [caneyTag.id, cousinTag.id];
    if (lead.extraTags.includes("friend") && friendTag) {
      wantTags.push(friendTag.id);
    }
    for (const tagId of wantTags) {
      await db
        .insert(contactTags)
        .values({ contactId: lead.id, tagId })
        .onConflictDoNothing();
    }
    console.log(
      `✓ ${lead.name.padEnd(22)}  ${lead.type.padEnd(6)}  ${lead.relationship.padEnd(8)}  tags: caney/via-joe-cousin${lead.extraTags.length ? "/" + lead.extraTags.join("/") : ""}`,
    );
  }

  // 4. Reminder for Joe — action item to backfill the cousin's identity +
  //    deepen each lead with real context.
  const tomorrow9am = new Date();
  tomorrow9am.setDate(tomorrow9am.getDate() + 1);
  tomorrow9am.setHours(9, 0, 0, 0);
  await db.insert(reminders).values({
    workspaceId: WS,
    forUserId: JOE_ID,
    createdBy: TOMAS_ID,
    subject:
      "Backfill cousin: name + WhatsApp + intro context on each of 8 posada leads (Sitios WOW, La Gaviota, Nacho, Lidio, Play Los Roques, Casa Turquesa, Kira, Elias+Rafael)",
    dueAt: tomorrow9am,
    recur: "once",
    sourceContactId: COUSIN_ID,
  });
  console.log(
    `\n✓ Reminder filed for Joe (due ${tomorrow9am.toISOString()})`,
  );

  console.log("\nDone. View at http://localhost:3000/contacts");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
