import "dotenv/config";
import { db } from "./index";
import { pipelineTemplates, pipelineStages, tags } from "./schema";

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline Templates + Stages (locked per ADR-002 D-03)
// ─────────────────────────────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: "caney-posada-onboarding",
    name: "Caney posada onboarding",
    description: "Onboard a posada owner to CaneyCloud PMS — from first contact through 90-day expansion review",
    stages: [
      ["First contact", 3, "tomas", "Initial outreach/inbound logged"],
      ["Discovery call", 7, "tomas", "30-min intro call held"],
      ["Demo", 5, "tomas", "PMS demo delivered, decision-maker present"],
      ["Pricing proposal", 3, "tomas", "Written pricing + tier proposal sent"],
      ["Contract sent", 5, "cofounder", "Service agreement drafted + sent"],
      ["Contract signed", 10, "cofounder", "Counter-signed contract returned"],
      ["Property data intake", 7, "either", "Inventory + rates + photos imported"],
      ["WhatsApp setup", 3, "either", "Posada's WhatsApp number connected to bot"],
      ["First 5 listings live", 7, "either", "5+ rooms/units published with availability"],
      ["First booking received", 14, "either", "First real customer booking processed"],
      ["30-day check-in", 30, "tomas", "Operator interview + issue log review"],
      ["90-day expansion review", 60, "either", "Upsell discussion / referral ask"],
    ],
  },
  {
    id: "vav-creator-campaign",
    name: "VAV creator campaign",
    description: "Court and execute a VAV (Vamos A Venezuela) creator partnership campaign end-to-end",
    stages: [
      ["Outreach", 5, "tomas", "DM/email sent"],
      ["Pitched", 7, "tomas", "Pitch deck/proposal delivered"],
      ["Interest confirmed", 5, "either", "Creator verbally/written in"],
      ["Trip dates agreed", 10, "either", "Calendar locked"],
      ["Trip logistics booked", 7, "cofounder", "Flights / posada / transport all booked"],
      ["Trip executed", null, "either", "Trip happened"],
      ["Content shot", 14, "either", "Raw footage confirmed received"],
      ["Content posted", 21, "either", "All deliverables live on creator's channels"],
      ["Engagement reviewed", 14, "tomas", "Performance pulled (reach/clicks/conversions)"],
      ["Paid out", 7, "cofounder", "Final payment processed + receipts filed"],
    ],
  },
  {
    id: "bd-courtship",
    name: "BD courtship",
    description: "General business development relationship — from warm intro to closed outcome",
    stages: [
      ["Intro / warm meeting", 7, "tomas", "First meeting held"],
      ["Discovery (need identified)", 14, "tomas", "Clear need/opportunity articulated"],
      ["Proposal sent", 10, "tomas", "Written proposal delivered"],
      ["Decision pending", 21, "either", "Their decision window"],
      ["Closed (won / lost / parked)", null, "either", "Outcome captured + relationship preserved"],
    ],
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Default Venture Tags
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TAGS = [
  { name: "caney", kind: "venture" as const, color: "#2e7d32" },
  { name: "vav", kind: "venture" as const, color: "#1565c0" },
  { name: "bd", kind: "venture" as const, color: "#6a1b9a" },
  { name: "friend", kind: "venture" as const, color: "#ef6c00" },
  { name: "ai-ok", kind: "custom" as const, color: "#00838f" },
  { name: "personal-only", kind: "custom" as const, color: "#c62828" },
];

async function main() {
  console.log("Seeding pipeline templates...");
  for (const tpl of TEMPLATES) {
    await db
      .insert(pipelineTemplates)
      .values({ id: tpl.id, name: tpl.name, description: tpl.description })
      .onConflictDoNothing();

    for (let i = 0; i < tpl.stages.length; i++) {
      const [name, sla, owner, criterion] = tpl.stages[i];
      await db
        .insert(pipelineStages)
        .values({
          templateId: tpl.id,
          order: i + 1,
          name: name as string,
          slaDays: sla as number | null,
          defaultOwner: owner as "tomas" | "cofounder" | "either",
          doneCriterion: criterion as string,
        })
        .onConflictDoNothing();
    }
    console.log(`  ✓ ${tpl.id} (${tpl.stages.length} stages)`);
  }

  console.log("Seeding default tags...");
  for (const tag of DEFAULT_TAGS) {
    await db.insert(tags).values(tag).onConflictDoNothing();
    console.log(`  ✓ ${tag.name}`);
  }

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
