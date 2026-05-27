// Seed Tomas's full venture portfolio into projects + project_links + themes.
// Idempotent: skips projects that already exist by title.

import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres.uktrhbvdamzfzbnhuwhn:ArevaloGutierrez%211234@aws-1-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true";

const sql = postgres(DATABASE_URL, { prepare: false, ssl: "require" });

const WORKSPACE_ID = "11111111-2222-3333-4444-aaaaaaaaaaa1"; // Tomas's workspace
const USER_ID = "9d543a9c-3dfe-4f2b-aa73-e0156d478dce"; // arevalogutierrezbajares@gmail.com

const THEMES = [
  { name: "Business Development", color: "#0F6E56", icon: "Briefcase" },
  { name: "Tech", color: "#185FA5", icon: "Server" },
  { name: "AI", color: "#534AB7", icon: "Sparkles" },
  { name: "Growth", color: "#3B6D11", icon: "TrendingUp" },
  { name: "Brand", color: "#A32D2D", icon: "Palette" },
  { name: "Ops", color: "#854F0B", icon: "Wrench" },
  { name: "Fundraising", color: "#BA7517", icon: "DollarSign" },
  { name: "Legal & Compliance", color: "#6B6B68", icon: "Scale" },
];

const PROJECTS = [
  {
    title: "VAV — Vamos a Venezuela",
    tagline: "Tourism marketplace + provider onboarding for Venezuela.",
    summary:
      "Multi-sided tourism marketplace connecting travelers with verified Venezuelan providers (posadas, tours, transport). Built on Next.js 16 + Supabase. v0.5.0.0 Bespoke Journeys shipped on a feature branch; IG-seeded provider onboarding (WS-A→D) merged to main as PR #9.",
    coverEmoji: "🇻🇪",
    coverColor: "#FACC15",
    statusText: "Active · v0.5 in progress · readiness 6/10",
    primaryUrl: "https://vamosavenezuela.com",
    themes: ["Tech", "Growth", "Business Development"],
    links: [
      // Business
      { category: "business", label: "Product brief", description: "Pitch deck & market thesis" },
      { category: "business", label: "Provider economics model", description: "Take-rate, payouts, onboarding cost per provider" },
      { category: "business", label: "Bespoke Journeys pricing", description: "Phase 1 rate card" },
      // Marketing
      { category: "marketing", label: "Landing page", url: "https://vamosavenezuela.com" },
      { category: "marketing", label: "Instagram", url: "https://instagram.com/vamosavenezuela" },
      { category: "marketing", label: "Provider acquisition playbook", description: "IG-seeded WS-A→D flow" },
      // Tech
      { category: "tech", label: "Repo", url: "https://github.com/" },
      { category: "tech", label: "Supabase project", description: "wwssfrsmuytbxvcvssav" },
      { category: "tech", label: "Vercel deploy", description: "Production at vamosavenezuela.com" },
      { category: "tech", label: "Production readiness checklist", description: "Blocked on JSON→Postgres migration" },
      // Ops
      { category: "ops", label: "Provider onboarding SOP", description: "WS-A through WS-D operations" },
    ],
  },
  {
    title: "CaneyCloud Tour PMS",
    tagline: "Property management system for Venezuelan posadas.",
    summary:
      "Vertical SaaS PMS for Venezuelan posadas — reservations, calendar, accounting, payments, WA concierge integration. Currently 92/155 tasks (~59%). Lives at --TOURISM-- repo, co-owned with JEAV. Accounting Round 1 ~25/44 with multiple waves in PM review.",
    coverEmoji: "🏨",
    coverColor: "#185FA5",
    statusText: "Active · 92/155 tasks · Accounting Wave B in PM queue",
    themes: ["Tech", "Business Development", "Ops"],
    links: [
      // Business
      { category: "business", label: "Pricing & packaging", description: "Multi-tenant SaaS model" },
      { category: "business", label: "Customer pipeline", description: "Posadas in onboarding" },
      { category: "business", label: "Partner agreements", description: "OTA + channel partners" },
      // Marketing
      { category: "marketing", label: "Brand guidelines", url: "https://caneycloud.com/brand" },
      { category: "marketing", label: "Product deck PDF" },
      { category: "marketing", label: "Demo videos (5x60s feature deeps)", description: "WhatsApp, Booking, Calendar, Integrations, Overview" },
      // Tech
      { category: "tech", label: "Repo (TOURISM)", description: "Co-owned with JEAV; route through Overlord board" },
      { category: "tech", label: "Cloud Run staging", description: "Backend deploy" },
      { category: "tech", label: "Supabase project (uktrhbvdamzfzbnhuwhn)" },
      { category: "tech", label: "Overlord task board", description: "16 sections; agent-driven execution" },
      { category: "tech", label: "Alembic migration chain", description: "Single head at 076 as of 2026-05-26" },
      // Ops
      { category: "ops", label: "GigaPaul PMO board", description: "Cross-project sprint state" },
      { category: "ops", label: "GigaChad test orchestrator", description: "Quality gates" },
    ],
  },
  {
    title: "CaneyCloud Restaurant",
    tagline: "Restaurant vertical: Beli + Resy + Toast for LATAM.",
    summary:
      "Restaurant operations platform — table mgmt, reservations, POS, kitchen flow, customer loyalty. Wave 4 complete: all 56 stories merged on 144-story base. Suite 3119 passed/2 xfailed. Wave 5 productionization HLR drafted.",
    coverEmoji: "🍽️",
    coverColor: "#A32D2D",
    statusText: "Wave 4 complete · Wave 5 (production) drafted",
    themes: ["Tech", "Business Development"],
    links: [
      { category: "business", label: "Market thesis", description: "Beli + Resy + Toast for LATAM" },
      { category: "business", label: "Pilot restaurant pipeline" },
      { category: "marketing", label: "Pitch deck" },
      { category: "tech", label: "Repo (caneycloud-restaurant)" },
      { category: "tech", label: "Wave 5 productionization HLR", description: "docs/OPS-SUITE-WAVE5-PRODUCTIONIZATION.md" },
      { category: "tech", label: "Test suite (3119 tests)" },
    ],
  },
  {
    title: "CaneyCloud WhatsApp Concierge",
    tagline: "Multilingual concierge agent over WhatsApp Cloud API.",
    summary:
      "Concierge AI as a Supabase edge function (Deno, NOT Node). Guest interactions, booking lookup, room service, recommendations. Text-only conversation history; tool state per-invocation. Lives in CaneyCloud workspace (wwssfrsmuytbxvcvssav).",
    coverEmoji: "💬",
    coverColor: "#0F6E56",
    statusText: "Active · production edge function",
    themes: ["AI", "Tech", "Business Development"],
    links: [
      { category: "business", label: "Customer use cases", description: "Posadas + restaurants + tourism providers" },
      { category: "business", label: "Pricing per guest interaction" },
      { category: "marketing", label: "Demo video — WhatsApp concierge flow" },
      { category: "tech", label: "Supabase edge function (Deno)" },
      { category: "tech", label: "Meta WhatsApp Cloud API setup" },
      { category: "tech", label: "Anthropic + tool definitions" },
      { category: "ops", label: "Conversation review queue" },
    ],
  },
  {
    title: "RUTA — Secure Transport Venezuela",
    tagline: "Executive protection + armored transport; pivoting to transport-first.",
    summary:
      "Florida-registered company providing armored transport, armed escorts, and journey management for energy/mining/diplomatic/corporate clients in Venezuela. v1 site mid-rewrite (13→9 sections). v2 booking engine living inside VAV.",
    coverEmoji: "🛡️",
    coverColor: "#B8913F",
    statusText: "Active · v1 site rewrite + v2 booking engine in VAV",
    primaryUrl: "https://rutasecurity.com",
    themes: ["Business Development", "Brand", "Tech"],
    links: [
      { category: "business", label: "Service tier spec (City/Extended/Expeditions)" },
      { category: "business", label: "Client pipeline" },
      { category: "business", label: "OFAC compliance memo" },
      { category: "marketing", label: "rutasecurity.com" },
      { category: "marketing", label: "Capability brief PDF" },
      { category: "marketing", label: "Intel product cards (Alerta/Diario/Campo/Embebido)" },
      { category: "tech", label: "Repo (formavz? — RUTA project files)" },
      { category: "tech", label: "Vercel deploy" },
      { category: "tech", label: "Anthropic itinerary builder API" },
      { category: "tech", label: "Resend email integration" },
      { category: "ops", label: "OFAC compliance + KYC SOP" },
    ],
  },
  {
    title: "AGB-CRM",
    tagline: "Chief-of-staff CRM for the whole portfolio.",
    summary:
      "Internal CRM at /Users/tomas/AGB-CRM — Next.js 16 + Drizzle + Supabase. 40/50 Phase tasks delivered autonomously. Now extended with Treasury, Work mgmt (initiatives/sprints/roadmap), Overlord mirror, Home dashboard with daily/weekly/monthly views.",
    coverEmoji: "🧠",
    coverColor: "#534AB7",
    statusText: "Active · Home + Treasury + Work + Overlord shipped",
    themes: ["Tech", "AI", "Ops"],
    links: [
      { category: "business", label: "Use-case doc (chief of staff workflow)" },
      { category: "marketing", label: "(internal — not customer-facing)" },
      { category: "tech", label: "Repo (AGB-CRM)" },
      { category: "tech", label: "Supabase project (uktrhbvdamzfzbnhuwhn)" },
      { category: "tech", label: "Vercel deploy" },
      { category: "tech", label: "Drizzle schema (db/schema.ts)" },
      { category: "tech", label: "Dashboard spec (DASHBOARD_SPEC.md)" },
      { category: "ops", label: "Roadmap (this app's /roadmap)" },
    ],
  },
  {
    title: "FormaVZ EdTech",
    tagline: "Spanish-first LMS for Venezuelan learners.",
    summary:
      "Clean-room LMS at /Users/tomas/formavz. Mandatory 'Source-Discipline: clean-room' footer. Latest snapshot commit 333d00f lands TASK-001 through 051 with 135 tests green. TASK-001/002 still in 'review' status despite downstream tasks shipped.",
    coverEmoji: "🎓",
    coverColor: "#3B6D11",
    statusText: "Snapshot 333d00f · 51 tasks · 135 tests green",
    themes: ["Tech", "Business Development", "Brand"],
    links: [
      { category: "business", label: "Market thesis" },
      { category: "business", label: "Course catalog plan" },
      { category: "marketing", label: "Brand identity (Spanish-first)" },
      { category: "tech", label: "Repo (formavz)" },
      { category: "tech", label: "Clean-room discipline doc" },
      { category: "tech", label: "Test coverage report (135 tests)" },
    ],
  },
  {
    title: "BMAD VZ Explorer (Mija)",
    tagline: "Next-gen Venezuela tourism — invisible AI concierge platform.",
    summary:
      "Planning-stage vision: Mija AI concierge, invisible platform, creator ecosystem, livestream network. Planning complete via BMAD method, dev not started. Spiritual successor to VAV.",
    coverEmoji: "✨",
    coverColor: "#7F77DD",
    statusText: "Planning complete · dev not started",
    themes: ["AI", "Business Development", "Brand", "Growth"],
    links: [
      { category: "business", label: "Mija AI concierge product brief" },
      { category: "business", label: "Creator ecosystem economics" },
      { category: "business", label: "Livestream network thesis" },
      { category: "marketing", label: "Invisible-platform positioning doc" },
      { category: "tech", label: "BMAD planning artifacts (_bmad/)" },
      { category: "tech", label: "Architecture stub" },
    ],
  },
  {
    title: "Gigachad Test Manager",
    tagline: "Cross-repo test orchestrator + agent.",
    summary:
      "Test orchestration agent covering 277 tests across 6 repos and 4 frameworks. Registry at ~/.claude/agents/test-registry.json. 27 commands. Coordinates with GigaPaul for sprint state.",
    coverEmoji: "💪",
    coverColor: "#E24B4A",
    statusText: "Active · 277 tests · 6 repos",
    themes: ["AI", "Tech", "Ops"],
    links: [
      { category: "business", label: "(internal — agent tooling)" },
      { category: "tech", label: "Agent definition (~/.claude/agents/)" },
      { category: "tech", label: "Test registry JSON" },
      { category: "tech", label: "27 commands manifest" },
      { category: "tech", label: "GigaPaul coordination protocol" },
    ],
  },
  {
    title: "GigaPaul PMO Agent",
    tagline: "Cross-project PMO orchestrator.",
    summary:
      "Cross-project PMO managing 6 projects, 36-month roadmap, sprint coordination. Peer to GigaChad quality agent. State at ~/.claude/agents/.",
    coverEmoji: "📊",
    coverColor: "#185FA5",
    statusText: "Active · 6 projects · 36-month roadmap",
    themes: ["AI", "Ops"],
    links: [
      { category: "business", label: "Portfolio coverage matrix" },
      { category: "tech", label: "Agent definition (~/.claude/agents/)" },
      { category: "tech", label: "Sprint state JSON" },
      { category: "tech", label: "Roadmap data" },
      { category: "ops", label: "Daily PMO standup template" },
    ],
  },
];

async function main() {
  console.log("Seeding portfolio…");

  // 1. Seed themes for the workspace
  const existingThemes = await sql`
    SELECT name, id FROM themes WHERE workspace_id = ${WORKSPACE_ID}
  `;
  const themeByName = new Map(existingThemes.map((t) => [t.name, t.id]));

  for (const t of THEMES) {
    if (themeByName.has(t.name)) continue;
    const [row] = await sql`
      INSERT INTO themes (workspace_id, name, color, icon)
      VALUES (${WORKSPACE_ID}, ${t.name}, ${t.color}, ${t.icon})
      RETURNING id
    `;
    themeByName.set(t.name, row.id);
    console.log("  + theme", t.name);
  }

  // 2. Seed projects
  const existingProjects = await sql`
    SELECT title, id FROM projects WHERE workspace_id = ${WORKSPACE_ID}
  `;
  const projByTitle = new Map(existingProjects.map((p) => [p.title, p.id]));

  for (const p of PROJECTS) {
    let projectId = projByTitle.get(p.title);
    if (!projectId) {
      const [row] = await sql`
        INSERT INTO projects (
          workspace_id, title, status, tagline, summary,
          cover_emoji, cover_color, primary_url, status_text, created_by
        ) VALUES (
          ${WORKSPACE_ID}, ${p.title}, 'active', ${p.tagline}, ${p.summary},
          ${p.coverEmoji}, ${p.coverColor}, ${p.primaryUrl ?? null},
          ${p.statusText ?? null}, ${USER_ID}
        )
        RETURNING id
      `;
      projectId = row.id;
      projByTitle.set(p.title, projectId);
      console.log("  + project", p.title);
    } else {
      // Update display fields on re-run
      await sql`
        UPDATE projects SET
          tagline = ${p.tagline},
          summary = ${p.summary},
          cover_emoji = ${p.coverEmoji},
          cover_color = ${p.coverColor},
          primary_url = ${p.primaryUrl ?? null},
          status_text = ${p.statusText ?? null},
          updated_at = NOW()
        WHERE id = ${projectId}
      `;
      console.log("  ~ project (updated)", p.title);
    }

    // 3. Tag themes for the project (idempotent via ON CONFLICT — actually skip if any exist)
    // We use a simpler approach: clear and re-apply each run since these are user-managed
    // Actually safer: only add if missing
    const existingThemeTags = await sql`
      SELECT initiative_id, theme_id FROM initiative_themes WHERE FALSE
    `;
    // Themes are tagged on initiatives, not projects directly in our schema.
    // For projects, we use the project_links table for categorization.
    // (Future: add project_themes m2m if needed.)

    // 4. Seed links per project
    const existingLinks = await sql`
      SELECT label, category FROM project_links WHERE project_id = ${projectId}
    `;
    const linkKeys = new Set(existingLinks.map((l) => `${l.category}|${l.label}`));

    let sortOrder = 0;
    for (const l of p.links) {
      const key = `${l.category}|${l.label}`;
      if (linkKeys.has(key)) {
        sortOrder++;
        continue;
      }
      await sql`
        INSERT INTO project_links (
          workspace_id, project_id, category, label, url, description, sort_order
        ) VALUES (
          ${WORKSPACE_ID}, ${projectId}, ${l.category}, ${l.label},
          ${l.url ?? null}, ${l.description ?? null}, ${sortOrder}
        )
      `;
      sortOrder++;
    }
  }

  console.log(`\nDone. ${PROJECTS.length} projects in portfolio.`);
  await sql.end();
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
