#!/usr/bin/env tsx
/**
 * Seed the H2 2026 "Road to Launch" roadmap into the Roadmap module.
 * Source of truth: caneycloud-launch/EOY-ROADMAP-2026.md.
 *
 * Idempotent + non-destructive: resolves the existing workspace + a member as
 * creator, find-or-creates 3 Lines of Business, then inserts each milestone as
 * an initiative (with H2 dates/health/goal) and its key deliverables as tasks.
 * Re-running skips anything already present (matched by title).
 *
 *   DATABASE_URL=... tsx scripts/seed-roadmap-h2.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { resolveProjectForInitiative } from "@/db/queries/roadmap";

const { workspaces, workspaceMembers, linesOfBusiness, initiatives, milestones } =
  schema;

type Health = "green" | "amber" | "red";
type Status = "planning" | "active" | "paused" | "done" | "cancelled";

type SeedInitiative = {
  title: string;
  goal: string;
  status: Status;
  health: Health;
  start: string;
  end: string;
  tasks: string[];
};

const LOBS: Array<{ title: string; tagline: string; inits: SeedInitiative[] }> = [
  {
    title: "Business",
    tagline: "Admin, incorporation, legal, finance, ops (build-mode)",
    inits: [
      {
        title: "B-M1 · Legal entity & IP",
        goal: "Decide structure (this week), engage counsel/accountant, incorporate.",
        status: "active",
        health: "amber",
        start: "2026-06-15",
        end: "2026-07-31",
        tasks: [
          "Structure review session (this week) — top-co + VE entity direction",
          "Engage counsel + SENIAT-savvy accountant (none retained yet)",
          "Incorporate top-co; tax IDs; bylaws",
          "Cap table + founder equity (Tomás/Jose/Charles) + vesting",
          "Trademarks: CaneyCloud, VamosAVenezuela, CaneyAcademy, CaneyExperiences",
        ],
      },
      {
        title: "B-M2 · Banking, payments & finance ops",
        goal: "Crypto-tolerant bank + USDT PSP + local VES; rails decision in 2 weeks.",
        status: "active",
        health: "amber",
        start: "2026-06-15",
        end: "2026-08-31",
        tasks: [
          "Payment-rails review (next 2 weeks): USDT provider + custody + VES + banking",
          "Secure crypto-tolerant bank + USDT PSP (Mercury bans VE, Brex bans crypto)",
          "Local VES rails (Pago Móvil / transfer) + reconciliation",
          "Accounting stack + bookkeeper + monthly close",
          "Build IGTF (3%) into pricing, invoicing & treasury",
        ],
      },
      {
        title: "B-M3 · Contracts, compliance & risk",
        goal: "ToS/DPA, customer + creator agreements, OFAC screening, insurance.",
        status: "planning",
        health: "amber",
        start: "2026-08-01",
        end: "2026-09-30",
        tasks: [
          "ToS + Privacy + DPA (GDPR baseline) + cookie consent",
          "Customer agreements: PMS SaaS, operator, VAV operator + traveler ToS",
          "OFAC SDN + 50%-ownership screening control on all counterparties",
          "Sign DPAs with sub-processors + publish sub-processor list",
          "Insurance (GL, tech E&O, cyber) + data-breach runbook",
        ],
      },
      {
        title: "B-M4 · Finance, runway & build-mode discipline",
        goal: "Capital-light; not raising in H2. Track burn + runway.",
        status: "active",
        health: "green",
        start: "2026-06-15",
        end: "2026-12-31",
        tasks: [
          "Budget + runway tracker (monthly burn, months of runway)",
          "Capital-light infra posture (provision paid infra only on triggers)",
          "Founder/contractor comp + equity agreed",
        ],
      },
      {
        title: "B-M5 · Internal ops & vendors",
        goal: "Tooling + vendor contracts + budgets.",
        status: "active",
        health: "green",
        start: "2026-06-15",
        end: "2026-07-31",
        tasks: [
          "Workspace + tooling (Workspace, Linear/Notion, Slack, 1Password, CRM)",
          "Vendor contracts: GCP, Vercel, Cloud SQL, Meta BSP, Resend, PostHog, Sentry",
        ],
      },
    ],
  },
  {
    title: "Tech & Product",
    tagline: "GCP migration, product rollout, testing (Jose + Tomás)",
    inits: [
      {
        title: "T-M1 · Infra: beta on Supabase → GCP for launch",
        goal: "Harden beta stack now; migrate to Cloud SQL pre-full-launch (Nov).",
        status: "active",
        health: "amber",
        start: "2026-06-15",
        end: "2026-11-30",
        tasks: [
          "CI/CD gates (tests gate deploy) + IaC",
          "Tenant isolation / RLS + cross-tenant probe suite",
          "Observability: Sentry, logs, uptime alerts, on-call",
          "Security review + remediation",
          "GCP migration (Nov): Cloud SQL + PITR + low-downtime cutover",
          "Load + anti-oversell test at launch volume",
        ],
      },
      {
        title: "T-M2 · PMS — review, polish & production-harden",
        goal: "PMS is built; review/polish/harden to paid-launch ready.",
        status: "active",
        health: "green",
        start: "2026-07-01",
        end: "2026-12-15",
        tasks: [
          "Full functionality review / QA pass across all modules",
          "Copy / wordiness pass (Spanish-first)",
          "SENIAT guest-invoice via authorized imprenta digital (Leg B)",
          "Payments: USDT + Pago Móvil capture + reconciliation",
          "Instagram Meta App Review + internal testing (WhatsApp done)",
          "Guest folio + deposits + cancellation policy + daily ops reports",
          "One live OTA channel via SiteMinder (Booking.com)",
        ],
      },
      {
        title: "T-M3 · Tour Operator Management — build-out + beta",
        goal: "In progress; build out + test; 5–10 beta operators.",
        status: "active",
        health: "amber",
        start: "2026-08-01",
        end: "2026-11-30",
        tasks: [
          "Complete operator product (inventory, capacity/no-oversell, pricing, bookings)",
          "Guide Pro + certification hook to Academy",
          "Inventory feed → VAV Experiences",
          "Digital waivers + participant manifest + check-in",
          "Bookable non-guide resources (boat/vehicle/equipment)",
          "Onboard 5–10 beta operators (avitourism/fishing)",
        ],
      },
      {
        title: "T-M4 · CaneyAcademy — build-out + curriculum + beta",
        goal: "In process; needs build-out, testing, curriculum review.",
        status: "active",
        health: "amber",
        start: "2026-09-01",
        end: "2026-11-30",
        tasks: [
          "Complete platform: courses, lessons, progress, certs + badges",
          "Quiz/assessment engine + gate certificate on pass",
          "Curriculum review + finalize ≥4 Spanish-first courses",
          "Cohort bulk-enroll + group progress view",
          "First certified cohort",
        ],
      },
      {
        title: "T-M5 · VamosAVenezuela — Explore + limited booking",
        goal: "Explore public + closed-loop booking (CaneyCloud properties only).",
        status: "planning",
        health: "amber",
        start: "2026-09-01",
        end: "2026-12-15",
        tasks: [
          "Explore public (region content, search, SEO) + thin-content guardrail",
          "Limited booking closed-loop → syncs into PMS + add-ons at checkout",
          "Cancellation policy tiers + traveler cancel/modify flow",
          "VAV payout/escrow policy + commission ledger",
          "Verified-booking reviews + 3DS/chargeback handling",
          "Extend anti-oversell test to the VAV path",
        ],
      },
      {
        title: "T-M6 · QA, testing & launch readiness",
        goal: "Test strategy, ship-check, production-readiness gates.",
        status: "active",
        health: "green",
        start: "2026-06-15",
        end: "2026-12-31",
        tasks: [
          "Unit/integration/E2E + production smoke; coverage target",
          "Ship-check + canary + rollback runbook",
          "Production-readiness review per phase gate (go/no-go)",
          "SPF/DKIM/DMARC email deliverability verified",
        ],
      },
    ],
  },
  {
    title: "GTM",
    tagline: "Creators, sales, onboarding & support (Charles, founder oversight)",
    inits: [
      {
        title: "G-M1 · Positioning, brand, pricing & sites",
        goal: "Finish + launch-prep both sites; pricing Free/$89/$179.",
        status: "active",
        health: "green",
        start: "2026-06-15",
        end: "2026-08-31",
        tasks: [
          "Brand system (logos, visual language)",
          "Finish + launch-prep caneycloud.com + VamosAVenezuela.com (content, pictures)",
          "Pricing finalized — Free (all core) / $89 / $179 (full) + pricing page",
          "Sales collateral (3-min WhatsApp demo, one-pagers, explainer)",
        ],
      },
      {
        title: "G-M2 · Pilot acquisition & sales motion",
        goal: "Activate warm relationships; sign 20–30 posadas + 5–10 operators.",
        status: "active",
        health: "green",
        start: "2026-07-01",
        end: "2026-09-30",
        tasks: [
          "Activate warm list (Círculo de Excelencia, Impronta) into CRM",
          "CRM + pipeline stages (lead → demo → beta → paying)",
          "Tiered partner/referral program + affiliate tracking",
          "Sign 20–30 pilot posadas + 5–10 operators",
          "Free → paid conversion playbook ($89/$179 money-makers)",
        ],
      },
      {
        title: "G-M3 · Creator / influencer engine",
        goal: "Start now (long lead). Build creator pipeline in CRM.",
        status: "active",
        health: "amber",
        start: "2026-06-15",
        end: "2026-11-30",
        tasks: [
          "@karenexplora live as ambassador + content plan",
          "Clara Vegas (Miss Venezuela) contract/LOI (Aug)",
          "Build creator pipeline in CRM (continuous) — ≥10 by Aug",
          "Koscot-safe two-tier comp spec (counsel-cleared before build)",
          "Program mechanics: booking-fee % + recruit % + clawback + anti-abuse",
        ],
      },
      {
        title: "G-M4 · Onboarding, docs & support",
        goal: "Onboarding playbook + help center + support SLA.",
        status: "planning",
        health: "green",
        start: "2026-09-01",
        end: "2026-12-31",
        tasks: [
          "Onboarding playbook + self-serve wizard + go-live checklist",
          "Help center / guides (PMS, Operator, Academy, VAV) — Spanish-first",
          "Support function: WhatsApp + email, ≤2h SLA, ticketing",
          "Activation + TTV + churn metrics instrumented; weekly ops review",
        ],
      },
      {
        title: "G-M5 · Launch & growth",
        goal: "VAV Explore launch + limited-booking GA + growth loops.",
        status: "planning",
        health: "green",
        start: "2026-11-01",
        end: "2026-12-31",
        tasks: [
          "VAV Explore public launch + creator campaign",
          "Limited-booking GA comms to CC clients",
          "Growth loops: referral, VAV booking pull, Academy certification",
          "Analytics/funnel (PostHog) + weekly KPI report",
          "EOY review + 2027 GTM plan & budget",
        ],
      },
    ],
  },
];

async function main() {
  const override = process.env.SEED_WORKSPACE_ID;
  const [ws] = override
    ? await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.id, override))
        .limit(1)
    : await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .orderBy(asc(workspaces.createdAt))
        .limit(1);
  if (!ws) throw new Error("No workspace found — create one first.");
  const workspaceId = ws.id;

  const [member] = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .limit(1);
  if (!member) throw new Error("No workspace member found.");
  const createdBy = member.userId;

  console.log(`Seeding roadmap into workspace ${workspaceId} as ${createdBy}`);

  let lobN = 0;
  let initN = 0;
  let taskN = 0;

  for (const lob of LOBS) {
    let [existing] = await db
      .select({ id: linesOfBusiness.id })
      .from(linesOfBusiness)
      .where(
        and(
          eq(linesOfBusiness.workspaceId, workspaceId),
          eq(linesOfBusiness.title, lob.title),
        ),
      )
      .limit(1);
    let lobId: string;
    if (existing) {
      lobId = existing.id;
    } else {
      const [created] = await db
        .insert(linesOfBusiness)
        .values({
          workspaceId,
          title: lob.title,
          tagline: lob.tagline,
          kind: "business",
          createdBy,
        })
        .returning({ id: linesOfBusiness.id });
      lobId = created.id;
      lobN++;
    }

    for (const init of lob.inits) {
      const [haveInit] = await db
        .select({ id: initiatives.id })
        .from(initiatives)
        .where(
          and(
            eq(initiatives.workspaceId, workspaceId),
            eq(initiatives.title, init.title),
          ),
        )
        .limit(1);
      let initiativeId: string;
      if (haveInit) {
        initiativeId = haveInit.id;
      } else {
        const [created] = await db
          .insert(initiatives)
          .values({
            workspaceId,
            lobId,
            title: init.title,
            goal: init.goal,
            status: init.status,
            healthColor: init.health,
            startDate: init.start,
            targetEndDate: init.end,
            createdBy,
          })
          .returning({ id: initiatives.id });
        initiativeId = created.id;
        initN++;
      }

      const projectId = await resolveProjectForInitiative({
        workspaceId,
        initiativeId,
        createdBy,
      });

      const existingTasks = await db
        .select({ title: milestones.title })
        .from(milestones)
        .where(eq(milestones.initiativeId, initiativeId));
      const have = new Set(existingTasks.map((t) => t.title));

      let order = 0;
      for (const title of init.tasks) {
        order += 10;
        if (have.has(title)) continue;
        await db.insert(milestones).values({
          workspaceId,
          projectId,
          initiativeId,
          title,
          order,
          createdBy,
        });
        taskN++;
      }
    }
  }

  console.log(`Done. +${lobN} LoBs, +${initN} initiatives, +${taskN} tasks.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
