// Update featured flag, logo_url, and objectives on existing projects.
// Idempotent.

import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres.uktrhbvdamzfzbnhuwhn:ArevaloGutierrez%211234@aws-1-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true";

const sql = postgres(DATABASE_URL, { prepare: false, ssl: "require" });
const WORKSPACE_ID = "11111111-2222-3333-4444-aaaaaaaaaaa1";

const UPDATES = [
  {
    title: "CaneyCloud",
    featured: true,
    logoUrl: "/logos/caneycloud.svg",
    objectives: [
      "Ship Stays MVP to 5 paying posadas",
      "Onboard 1 pilot restaurant + 1 pilot chain",
      "WA Concierge integrated across all 3 modules",
      "Accounting waves A+B in production",
      "Single sign-on across modules",
    ],
  },
  {
    title: "VAV — Vamos a Venezuela",
    featured: true,
    logoUrl: "/logos/vav.svg",
    objectives: [
      "Migrate JSON catalog → Postgres",
      "Hit production-readiness 8/10",
      "100 verified providers onboarded via IG-seeded flow",
      "First 10 Bespoke Journey bookings paid",
      "Launch landing page + Instagram drip campaign",
    ],
  },
  {
    title: "AGB-CRM",
    logoUrl: null,
    objectives: [
      "Daily-driver Home dashboard (shipped)",
      "Treasury + Work + Overlord modules (shipped)",
      "Email + WhatsApp ingestion via Postmark",
      "AI Assist with real Claude-backed insights",
      "Wire to Linear / GitHub for cross-project signals",
    ],
  },
  {
    title: "RUTA — Secure Transport Venezuela",
    objectives: [
      "Pivot v1 site from 13 → 9 sections",
      "Build v2 booking engine inside VAV",
      "Land 3 enterprise transport clients",
      "Publish MIRO intel product tier 1",
    ],
  },
  {
    title: "Cosecha",
    objectives: [
      "Define product thesis + ICP",
      "Sign first 3 grower partnerships",
      "Build sourcing-portal MVP",
      "Land 1 anchor buyer LOI",
    ],
  },
  {
    title: "MIRO Intelligence",
    objectives: [
      "Define tier 1 → tier 4 product spec",
      "Build data-ingestion pipeline",
      "Publish first weekly Alerta-style report",
      "Sign 2 paying enterprise clients",
    ],
  },
  {
    title: "FormaVZ EdTech",
    objectives: [
      "Resolve TASK-001 / TASK-002 review backlog",
      "Ship first course catalog with 5 courses",
      "Spanish-first onboarding flow",
      "Pilot with 100 students",
    ],
  },
];

const MODULE_UPDATES = [
  {
    title: "Stays",
    objectives: [
      "Onboard 5 posadas to PMS",
      "Reservations + calendar + accounting wave A live",
      "OTA channel integration (Booking.com first)",
    ],
  },
  {
    title: "Restaurants",
    objectives: [
      "Wave 5 productionization complete",
      "Pilot with 1 restaurant in CCS",
      "Loyalty + POS integration",
    ],
  },
  {
    title: "WA Concierge",
    objectives: [
      "Bilingual EN/ES tool coverage parity",
      "Multimedia inputs (voice, image)",
      "Hand-off to human staff on escalation",
    ],
  },
];

async function applyUpdate(u) {
  const rows = await sql`
    SELECT id FROM projects WHERE workspace_id = ${WORKSPACE_ID} AND title = ${u.title} LIMIT 1
  `;
  if (!rows[0]) {
    console.log(`  ! not found: ${u.title}`);
    return;
  }
  const id = rows[0].id;
  const sets = [];
  if (u.featured !== undefined) sets.push({ k: "featured", v: u.featured });
  if (u.logoUrl !== undefined) sets.push({ k: "logo_url", v: u.logoUrl });
  if (u.objectives !== undefined)
    sets.push({ k: "objectives", v: JSON.stringify(u.objectives), json: true });

  // Use individual updates for type clarity
  if (u.featured !== undefined) {
    await sql`UPDATE projects SET featured = ${u.featured}, updated_at = NOW() WHERE id = ${id}`;
  }
  if (u.logoUrl !== undefined) {
    await sql`UPDATE projects SET logo_url = ${u.logoUrl}, updated_at = NOW() WHERE id = ${id}`;
  }
  if (u.objectives !== undefined) {
    await sql`UPDATE projects SET objectives = ${sql.json(u.objectives)}, updated_at = NOW() WHERE id = ${id}`;
  }
  console.log(`  ~ ${u.title}: ${sets.map((s) => s.k).join(", ")}`);
}

async function main() {
  console.log("Updating portfolio meta…\n");
  for (const u of UPDATES) await applyUpdate(u);
  for (const u of MODULE_UPDATES) await applyUpdate(u);

  console.log("\nFinal featured projects:");
  const featured = await sql`
    SELECT title, logo_url FROM projects
    WHERE workspace_id = ${WORKSPACE_ID} AND featured = true
    ORDER BY title
  `;
  for (const p of featured) {
    console.log(`  ⭐ ${p.title}${p.logo_url ? ` · ${p.logo_url}` : ""}`);
  }

  await sql.end();
}

main().catch((e) => {
  console.error("Update failed:", e);
  process.exit(1);
});
