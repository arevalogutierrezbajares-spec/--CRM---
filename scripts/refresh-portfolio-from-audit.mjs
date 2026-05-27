// Refresh project records from a real audit of each repo on disk (2026-05-27).
// Replaces stub links with concrete repo/doc paths and updates summaries.

import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres.uktrhbvdamzfzbnhuwhn:ArevaloGutierrez%211234@aws-1-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true";

const sql = postgres(DATABASE_URL, { prepare: false, ssl: "require" });
const WORKSPACE_ID = "11111111-2222-3333-4444-aaaaaaaaaaa1";

/**
 * For each project, we ship:
 *   - meta updates (summary/statusText/objectives/logo)
 *   - links: a fully redacted list reflecting the real disk state
 * Existing links keep their categories but we rewrite the catalog so old
 * stubs get replaced by real ones.
 */

const PROJECTS = {
  "VAV — Vamos a Venezuela": {
    summary:
      "Tourism marketplace + provider onboarding for Venezuela. Next.js 16 (App Router), Supabase, PostHog + Vercel Analytics. v0.7.0.0 on `main`. Provider onboarding (WS-A→D) shipped; Bespoke Journeys v0.5.0.0 in flight. ~191 tests; production-readiness graded 6/10, blocked on JSON→Postgres migration. Co-owned with JEAV; routes through Overlord task board in --TOURISM--.",
    statusText: "v0.7.0.0 · 191 tests · readiness 6/10",
    primaryUrl: "https://vamosavenezuela.com",
    repoUrl: "https://github.com/arevalogutierrezbajares-spec/VZ_Tourism_Project",
    objectives: [
      "Migrate JSON catalog → Postgres (unblock production)",
      "Hit production-readiness 8/10",
      "100 verified providers onboarded via IG-seeded WS-A→D flow",
      "First 10 Bespoke Journey bookings paid via Stripe",
      "Wire PostHog + Vercel Analytics in layout.tsx",
    ],
    links: [
      // Business
      { category: "business", label: "Bespoke Journeys product brief", description: "v0.5.0.0 scope on feat/spots-journeys" },
      { category: "business", label: "Provider economics model", description: "Take-rate, payouts, IG-seeded acquisition cost" },
      { category: "business", label: "Production-readiness scorecard (6/10)", description: "Blocked on JSON→Postgres migration" },
      { category: "business", label: "Future vision: Mija AI concierge (BMAD VZ Explorer)", description: "Next-gen evolution — invisible AI concierge platform" },
      { category: "business", label: "Creator ecosystem (Mija Wave 6 shipped)", description: "Invite system, portal, dashboard, earnings, codes" },
      // Marketing
      { category: "marketing", label: "Production site", url: "https://vamosavenezuela.com" },
      { category: "marketing", label: "Instagram", url: "https://instagram.com/vamosavenezuela" },
      { category: "marketing", label: "Vamos wordmark (public/vamos-wordmark.png)" },
      { category: "marketing", label: "Provider acquisition playbook (WS-A→D)" },
      // Tech
      { category: "tech", label: "Repo (VZ_Tourism_Project)", url: "https://github.com/arevalogutierrezbajares-spec/VZ_Tourism_Project" },
      { category: "tech", label: "Local: /Users/tomas/VZ_Tourism_Project" },
      { category: "tech", label: "Next.js 16.2.6 + Supabase", description: "App Router, TypeScript strict" },
      { category: "tech", label: "Docs/ADR-Infrastructure-Platform.md" },
      { category: "tech", label: "Docs/Data-Model-Audit.md" },
      { category: "tech", label: "Docs/E2E-Test-Plan-20260505.md" },
      { category: "tech", label: "Docs/CONTENT-AUDIT-LAUNCH.md" },
      { category: "tech", label: "Docs/GigaQuad-Overview.md" },
      { category: "tech", label: "BMAD planning artifacts (_bmad-output/)" },
      // Ops
      { category: "ops", label: "PostHog + Vercel Analytics (not yet wired)" },
      { category: "ops", label: "Overlord task board (TOURISM repo)" },
    ],
  },

  "CaneyCloud": {
    summary:
      "Hospitality OS for Venezuela — three modules sharing core PMS, accounting, channel manager, and WhatsApp AI concierge. Stays (posada PMS, --TOURISM-- repo, Python FastAPI backend + Next frontend on Cloud Run + Supabase), Restaurants (caneycloud-restaurant repo, Beli+Resy+Toast for LATAM), WA Concierge (whatsapp-concierge repo, production-proven on VAV since April 2026). Co-owned with JEAV via Overlord board.",
    statusText: "3 modules · Stays 92/155 · Restaurants Wave 4 done · WA Concierge in prod",
    primaryUrl: "https://caneycloud.com",
    repoUrl: "https://github.com/arevalogutierrezbajares-spec/--TOURISM--",
    objectives: [
      "Ship Stays MVP to 5 paying posadas",
      "Onboard 1 pilot restaurant + 1 pilot chain",
      "WA Concierge integrated across all 3 modules",
      "Accounting waves A + B in production",
      "Single sign-on across modules",
    ],
    links: [
      // Business
      { category: "business", label: "Pricing & packaging (per-property SaaS)" },
      { category: "business", label: "Customer pipeline (posadas + restaurants + chains)" },
      { category: "business", label: "Partner agreements (OTAs, payment processors)" },
      // Marketing
      { category: "marketing", label: "caneycloud.com landing", url: "https://caneycloud.com" },
      { category: "marketing", label: "Brand assets (caneycloud-launch repo)", description: "horizontal/stacked/icon SVG + 1440x400 PNG" },
      { category: "marketing", label: "Product deck (CaneyCloud-Deck.pdf)" },
      { category: "marketing", label: "5 feature-deep 60s promo videos", description: "WhatsApp, Booking, Calendar, Integrations, Overview" },
      // Tech
      { category: "tech", label: "TOURISM repo (Stays + accounting + concierge)", url: "https://github.com/arevalogutierrezbajares-spec/--TOURISM--" },
      { category: "tech", label: "Local: /Users/tomas/--TOURISM--" },
      { category: "tech", label: "Overlord task board (16 sections)", description: "section-stays, accounting, calendar, finance, infrastructure, orchestration, payments, reservations, etc." },
      { category: "tech", label: "Cloud Run staging deploys (backend)" },
      { category: "tech", label: "Supabase project uktrhbvdamzfzbnhuwhn" },
      { category: "tech", label: "Alembic migration chain (single head 076)" },
      // Ops
      { category: "ops", label: "Co-owned with JEAV — operator-side", description: "All work routes through Overlord board" },
      { category: "ops", label: "GigaPaul PMO board (cross-project sprint state)" },
      { category: "ops", label: "GigaChad test orchestrator (quality gates)" },
    ],
  },

  "Stays": {
    summary:
      "Property management system for Venezuelan posadas. Python FastAPI backend (APP/backend), Next.js frontend (APP/frontend), Alembic migrations, Supabase Postgres. 92/155 tasks (~59%) on the Overlord board. Latest commit on main: refresh-token rotation race fixed (auth section).",
    statusText: "92/155 tasks · single alembic head 076 · auth race fixed on main",
    objectives: [
      "Onboard 5 posadas to the PMS",
      "Reservations + calendar + Accounting Wave A live in production",
      "OTA channel integration (Booking.com first)",
      "VAV channel anti-oversell hardening (TASK-INF-004)",
    ],
    links: [
      { category: "business", label: "Posada onboarding pipeline" },
      { category: "business", label: "OTA channel partnerships" },
      { category: "marketing", label: "Demo video — Booking flow" },
      { category: "marketing", label: "Demo video — Calendar flow" },
      { category: "tech", label: "TOURISM/APP/backend (FastAPI + SQLAlchemy)" },
      { category: "tech", label: "TOURISM/APP/frontend (Next.js)" },
      { category: "tech", label: "TOURISM/APP/backend/alembic/versions/" },
      { category: "tech", label: "Section-reservations TASKS.md" },
      { category: "tech", label: "Section-accounting TASKS.md" },
      { category: "tech", label: "Section-calendar TASKS.md" },
      { category: "ops", label: "Refresh-token rotation race fixed (b6d73df7)" },
    ],
  },

  "Restaurants": {
    summary:
      "Restaurant operations platform — table management, reservations, POS, kitchen flow, customer loyalty. Beli + Resy + Toast for LATAM. Wave 4 complete (all 56 stories merged on 144-story base). Wave 5 productionization HLR drafted (docs/OPS-SUITE-WAVE5-PRODUCTIONIZATION.md). Suite 3119 passed / 2 xfailed.",
    statusText: "Wave 4 done · 3119 tests · Wave 5 (production) drafted",
    repoUrl: "https://github.com/arevalogutierrezbajares-spec/caneycloud-restaurant",
    objectives: [
      "Wave 5 productionization complete",
      "Pilot with 1 restaurant in CCS",
      "Loyalty + POS integration shipped",
    ],
    links: [
      { category: "business", label: "Market thesis (Beli + Resy + Toast for LATAM)" },
      { category: "business", label: "Pilot restaurant pipeline" },
      { category: "marketing", label: "Pitch deck (TBD)" },
      { category: "tech", label: "Repo (caneycloud-restaurant)", url: "https://github.com/arevalogutierrezbajares-spec/caneycloud-restaurant" },
      { category: "tech", label: "Local: /Users/tomas/caneycloud-restaurant" },
      { category: "tech", label: "docs/OPS-SUITE-WAVE5-PRODUCTIONIZATION.md" },
      { category: "tech", label: "Test suite (3119 passed / 2 xfailed)" },
      { category: "tech", label: ".impeccable critique probe scripts (T1 + T8)" },
    ],
  },

  "WA Concierge": {
    summary:
      "Self-contained WhatsApp AI guest communication module for hospitality PMS platforms. Each property gets a custom AI persona handling guest inquiries 24/7 via WhatsApp Cloud API, with human takeover, escalation intelligence, dynamic pricing, and full conversation transparency. Production-proven since April 2026 on VAV. 190 unit + 53 integration tests, CI/CD pipeline.",
    statusText: "In production on VAV since Apr 2026 · 243 tests · CI/CD live",
    repoUrl: "https://github.com/arevalogutierrezbajares-spec/whatsapp-concierge",
    objectives: [
      "Bilingual EN/ES tool coverage parity",
      "Multimedia inputs (voice, image)",
      "Hand-off to human staff on escalation",
      "Integrate across all 3 CaneyCloud modules",
    ],
    links: [
      { category: "business", label: "Customer use cases (posadas + restaurants + tourism)" },
      { category: "business", label: "Pricing per guest interaction" },
      { category: "marketing", label: "Demo video — WhatsApp concierge flow" },
      { category: "tech", label: "Repo (whatsapp-concierge)", url: "https://github.com/arevalogutierrezbajares-spec/whatsapp-concierge" },
      { category: "tech", label: "Local: /Users/tomas/whatsapp-concierge" },
      { category: "tech", label: "Standalone fork: /Users/tomas/whatsapp-concierge-standalone" },
      { category: "tech", label: "WhatsApp Business Cloud API v21.0" },
      { category: "tech", label: "Anthropic + tool definitions per persona" },
      { category: "tech", label: "CI/CD pipeline (GitHub Actions)" },
      { category: "ops", label: "Production conversations on VAV (live)" },
    ],
  },

  "AGB-CRM": {
    summary:
      "Chief-of-staff CRM for Tomas's full portfolio. Next.js 16 + Drizzle ORM + Supabase. Daily-driver Home dashboard (Daily/Weekly/Monthly views), Treasury module (multi-currency, FX, subscriptions), Work module (themes/initiatives/sprints/roadmap), Overlord mirror (one-way sync from TOURISM TASKS.md), Projects portfolio (this page). Enterprise AI tools embedded: GigaChad test orchestrator + GigaPaul PMO agent (Anthropic-backed).",
    statusText: "Active dev · Home + Treasury + Work + Overlord + Projects shipped",
    repoUrl: "https://github.com/arevalogutierrezbajares-spec/--CRM---",
    objectives: [
      "Email + WhatsApp ingestion via Postmark + WA inbound",
      "AI Assist with real Claude-backed insights from real activity",
      "Link to Linear / GitHub for cross-project signals",
      "Mobile-first review mode for iPad/phone",
      "Inline editors for project links / objectives / themes",
    ],
    links: [
      { category: "business", label: "Use-case doc (chief of staff workflow)" },
      { category: "tech", label: "Repo (--CRM---)", url: "https://github.com/arevalogutierrezbajares-spec/--CRM---" },
      { category: "tech", label: "Local: /Users/tomas/AGB-CRM" },
      { category: "tech", label: "Supabase project (uktrhbvdamzfzbnhuwhn)" },
      { category: "tech", label: "Drizzle schema (db/schema.ts)" },
      { category: "tech", label: "Migrations (db/migrations/ 0001–0006)" },
      { category: "tech", label: "Dashboard spec (CLAUDE.md DASHBOARD_SPEC)" },
      { category: "tech", label: "Enterprise AI Tool: GigaChad Test Manager", description: "277 tests across 6 repos / 4 frameworks. Registry at ~/.claude/agents/test-registry.json" },
      { category: "tech", label: "Enterprise AI Tool: GigaPaul PMO Agent", description: "6 projects, 36-month roadmap, sprint coordination. State at ~/.claude/agents/" },
      { category: "ops", label: "GigaChad ↔ GigaPaul coordination protocol" },
      { category: "ops", label: "Daily PMO standup template (GigaPaul)" },
      { category: "ops", label: "Roadmap (this app's /roadmap)" },
    ],
  },

  "RUTA — Secure Transport Venezuela": {
    summary:
      "Florida-registered company providing armored transport, armed escorts, and journey management for energy/mining/diplomatic/corporate clients in Venezuela. v1 marketing site (Next.js 14, Tailwind, Framer Motion, Anthropic itinerary builder, Resend email, interactive risk map, lead capture). Pivoting from security-first to transport-first; v2 booking engine living inside VAV. Reference RUTA-Whitepaper.md + vz-docs/RUTA-Platform + RUTA_Pitch_Deck.pptx.",
    statusText: "v1 site mid-rewrite (13→9 sections) · v2 booking engine in VAV",
    primaryUrl: "https://rutasecurity.com",
    repoUrl: "https://github.com/arevalogutierrezbajares-spec/RUTA_Transport",
    objectives: [
      "Pivot v1 site from 13 → 9 sections",
      "Build v2 booking engine inside VAV (shared codebase)",
      "Land 3 enterprise transport clients",
      "Publish MIRO intel product as a paid tier",
    ],
    links: [
      { category: "business", label: "Service tier spec (City / Extended / Expeditions)" },
      { category: "business", label: "Client pipeline (energy, mining, diplomatic, corporate)" },
      { category: "business", label: "OFAC compliance memo" },
      { category: "business", label: "RUTA Pitch Deck (Downloads/RUTA_Pitch_Deck.pptx)" },
      { category: "business", label: "RUTA Functional Requirements (Downloads/)" },
      { category: "marketing", label: "rutasecurity.com production", url: "https://rutasecurity.com" },
      { category: "marketing", label: "Landing mockups (Downloads/ruta-landing-mockup*.html)" },
      { category: "marketing", label: "Capability brief PDF" },
      { category: "marketing", label: "Intel product cards (Alerta / Diario / Campo / Embebido)" },
      { category: "tech", label: "Repo (RUTA_Transport)", url: "https://github.com/arevalogutierrezbajares-spec/RUTA_Transport" },
      { category: "tech", label: "Local: /Users/tomas/caneycloud-launch (RUTA_Transport.git working tree)" },
      { category: "tech", label: "Anthropic itinerary builder API (Claude sonnet-4-5)" },
      { category: "tech", label: "Risk map (25 VZ states, geoBoundaries CC BY 3.0)" },
      { category: "tech", label: "Resend email integration" },
      { category: "ops", label: "OFAC compliance + KYC SOP" },
      { category: "ops", label: "Wiki: /Users/tomas/wiki/RUTA-Whitepaper.md" },
      { category: "ops", label: "Platform docs: /Users/tomas/vz-docs/RUTA-Platform" },
    ],
  },

  "FormaVZ EdTech": {
    summary:
      "Spanish-first LMS for Venezuelan learners. Clean-room codebase (mandatory `Source-Discipline: clean-room` footer on every change). Snapshot commit 333d00f lands TASK-001 through 051; current head b3f5e0a has 25 commits + 191 tests + localhost-bootable. TASK-001/002 still in 'review' despite downstream tasks shipped.",
    statusText: "25 commits · 191 tests · localhost-bootable",
    repoUrl: "https://github.com/arevalogutierrezbajares-spec/formavz",
    objectives: [
      "Resolve TASK-001 / TASK-002 review backlog",
      "Ship first course catalog with 5 courses",
      "Spanish-first onboarding flow live",
      "Pilot with 100 students",
    ],
    links: [
      { category: "business", label: "Market thesis (Spanish-first learners)" },
      { category: "business", label: "Course catalog plan (5 courses MVP)" },
      { category: "marketing", label: "Brand identity (Spanish-first)" },
      { category: "tech", label: "Repo (formavz)", url: "https://github.com/arevalogutierrezbajares-spec/formavz" },
      { category: "tech", label: "Local: /Users/tomas/formavz" },
      { category: "tech", label: "Clean-room discipline (Source-Discipline footer)" },
      { category: "tech", label: "Test suite (191 tests, localhost-bootable)" },
      { category: "tech", label: "_research/ + _tasks/ folders" },
    ],
  },

  "Cosecha": {
    summary:
      "WhatsApp-native B2B2C agricultural marketplace connecting Venezuelan farmers to vendors via field agents, with USDC (Tron TRC-20) payouts and Pago Móvil payments. Turborepo monorepo: Hono API (apps/api), Next.js 15 dashboard (apps/dashboard), Drizzle ORM (packages/core), WhatsApp Business Cloud API v21.0 (packages/whatsapp), Pago Móvil + USDC escrow (packages/payments). 248 tests, 100% source module coverage. CI: GitHub Actions typecheck → lint → test. Deploys to Vercel.",
    statusText: "Turborepo · 248 tests · prod-readiness gates added",
    repoUrl: "(local-only; no GitHub remote yet)",
    objectives: [
      "Sign first 3 grower partnerships",
      "Field agent onboarding flow (WhatsApp-only) live",
      "First USDC payout to a farmer",
      "Pilot with 1 anchor buyer (restaurant or market)",
      "Set up GitHub remote + push",
    ],
    links: [
      { category: "business", label: "Product thesis (B2B2C produce, WA-native)" },
      { category: "business", label: "Grower pipeline (field-agent enrollment)" },
      { category: "business", label: "Buyer relationships (restaurants, markets)" },
      { category: "business", label: "USDC + Pago Móvil settlement model" },
      { category: "marketing", label: "Brand identity (TBD)" },
      { category: "marketing", label: "Landing page (TBD — no consumer web yet)" },
      { category: "tech", label: "Local: /Users/tomas/vz-farmers-marketplace" },
      { category: "tech", label: "CLAUDE.md (full architecture spec)" },
      { category: "tech", label: "Turborepo + pnpm workspaces (5 packages)" },
      { category: "tech", label: "apps/api — Hono on Node.js" },
      { category: "tech", label: "apps/dashboard — Next.js 15 + Supabase Auth" },
      { category: "tech", label: "packages/whatsapp — WA Business Cloud API v21" },
      { category: "tech", label: "packages/payments — Pago Móvil + USDC escrow" },
      { category: "tech", label: "Vitest suite (248 tests, 20 files)" },
      { category: "ops", label: "Production-readiness gates added (latest commit)" },
      { category: "ops", label: "GitHub Actions CI pipeline" },
      { category: "ops", label: "Vercel deploy + cron jobs (vercel.json)" },
    ],
  },

  "MIRO Intelligence": {
    summary:
      "AI-powered Venezuelan land investment intelligence platform. Python 3.12 backend (psycopg/geoalchemy2/shapely/pyproj/rasterio for geo, httpx/beautifulsoup4/selectolax for scraping, Anthropic for AI) + Next.js + Mapbox frontend dashboard + Playwright browser scrapers. Agents: distribution, enrichment, geocoder, monitoring, scoring, scrapers. Positioned to complement RUTA's intel tier products.",
    statusText: "Python + Next.js + Mapbox · 6 agent modules · scraper pipeline live",
    repoUrl: "https://github.com/arevalogutierrezbajares-spec/vz-land-intel",
    objectives: [
      "Publish first weekly Alerta-style land report",
      "Sign 2 paying enterprise clients",
      "Geocoder + enrichment coverage = all 23 VZ states",
      "Scoring model validated against historical transactions",
    ],
    links: [
      { category: "business", label: "Product tiers + pricing (vs RUTA's Alerta/Diario/Campo/Embebido)" },
      { category: "business", label: "Client pipeline (energy / mining / diplomatic prospects)" },
      { category: "business", label: "Data sources + licensing (scraping ethics)" },
      { category: "marketing", label: "Sample land-intel report (TBD)" },
      { category: "marketing", label: "Positioning vs RUTA intel" },
      { category: "tech", label: "Repo (vz-land-intel)", url: "https://github.com/arevalogutierrezbajares-spec/vz-land-intel" },
      { category: "tech", label: "Local: /Users/tomas/vz-land-intel" },
      { category: "tech", label: "Python 3.12 backend (psycopg + geoalchemy2)" },
      { category: "tech", label: "agents/scrapers/ (Playwright + selectolax)" },
      { category: "tech", label: "agents/enrichment/ + agents/geocoder/" },
      { category: "tech", label: "agents/scoring/ + agents/monitoring/" },
      { category: "tech", label: "agents/distribution/" },
      { category: "tech", label: "frontend/ — Next.js + Mapbox dashboard" },
      { category: "tech", label: "PostGIS migrations" },
      { category: "ops", label: "Editorial cadence (weekly Alerta-style)" },
    ],
  },
};

async function clearAndInsertLinks(projectId, links) {
  await sql`DELETE FROM project_links WHERE project_id = ${projectId}`;
  let order = 0;
  for (const l of links) {
    await sql`
      INSERT INTO project_links (
        workspace_id, project_id, category, label, url, description, sort_order
      ) VALUES (
        ${WORKSPACE_ID}, ${projectId}, ${l.category}, ${l.label},
        ${l.url ?? null}, ${l.description ?? null}, ${order}
      )
    `;
    order++;
  }
}

async function main() {
  console.log("Refreshing portfolio from disk audit…\n");

  for (const [title, meta] of Object.entries(PROJECTS)) {
    const rows = await sql`
      SELECT id FROM projects WHERE workspace_id = ${WORKSPACE_ID} AND title = ${title} LIMIT 1
    `;
    if (!rows[0]) {
      console.log(`  ! not found: ${title}`);
      continue;
    }
    const id = rows[0].id;

    const updates = [];
    if (meta.summary !== undefined) updates.push("summary");
    if (meta.statusText !== undefined) updates.push("status_text");
    if (meta.primaryUrl !== undefined) updates.push("primary_url");
    if (meta.repoUrl !== undefined) updates.push("repo_url");
    if (meta.objectives !== undefined) updates.push("objectives");

    if (meta.summary !== undefined)
      await sql`UPDATE projects SET summary = ${meta.summary}, updated_at = NOW() WHERE id = ${id}`;
    if (meta.statusText !== undefined)
      await sql`UPDATE projects SET status_text = ${meta.statusText}, updated_at = NOW() WHERE id = ${id}`;
    if (meta.primaryUrl !== undefined)
      await sql`UPDATE projects SET primary_url = ${meta.primaryUrl}, updated_at = NOW() WHERE id = ${id}`;
    if (meta.repoUrl !== undefined)
      await sql`UPDATE projects SET repo_url = ${meta.repoUrl}, updated_at = NOW() WHERE id = ${id}`;
    if (meta.objectives !== undefined)
      await sql`UPDATE projects SET objectives = ${sql.json(meta.objectives)}, updated_at = NOW() WHERE id = ${id}`;

    if (meta.links) {
      await clearAndInsertLinks(id, meta.links);
    }

    console.log(
      `  ~ ${title} (${updates.join(", ")}${meta.links ? `, ${meta.links.length} links` : ""})`,
    );
  }

  await sql.end();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error("Refresh failed:", e);
  process.exit(1);
});
