/**
 * THE BRAIN — migration / schema entity extractor (FR-PIPE-2).
 *
 * Counts (and names a few) DB tables from each live system's schema source:
 *   - VAV       supabase/migrations/*.sql          (count files)
 *   - CaneyCloud APP/backend/alembic/versions/*.py (count files)
 *   - AGB-CRM   db/schema.ts                        (count pgTable() decls)
 *
 * Read-only (NFR-SEC-3). Returns per-system migration/table counts in a `meta`
 * map the orchestrator folds into the system L1 node meta string, plus a small
 * set of representative entity nodes per system for drill-down depth.
 *
 * Robustness: a missing source degrades to zero, never throws.
 */

import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOTS } from "../config.mjs";
import { entityNode } from "../lib/emit.mjs";
import { bucketByKeyword, VAV_DOMAINS, CANEY_DOMAINS, CRM_DOMAINS } from "../lib/taxonomy.mjs";

function countFiles(dir, ext) {
  if (!dir || !existsSync(dir)) return [];
  try {
    return readdirSync(dir).filter((f) => f.endsWith(ext) && !f.startsWith("."));
  } catch {
    return [];
  }
}

/** Pull `pgTable("name", ...)` table names from a Drizzle schema file. */
function drizzleTables(schemaPath) {
  if (!schemaPath || !existsSync(schemaPath)) return [];
  let raw;
  try {
    raw = readFileSync(schemaPath, "utf8");
  } catch {
    return [];
  }
  const names = [];
  const re = /pgTable\(\s*"([a-z0-9_]+)"/g;
  let m;
  while ((m = re.exec(raw))) names.push(m[1]);
  return [...new Set(names)];
}

/**
 * @returns {{ counts: Record<string, number>, nodes: import("../../../lib/brain/types.ts").BrainNode[] }}
 */
export function extractMigrationEntities() {
  const nodes = [];

  // ── VAV: count Supabase migration files ──
  const vavMigs = countFiles(
    join(REPO_ROOTS.vav, "supabase", "migrations"),
    ".sql",
  );

  // ── CaneyCloud: count Alembic revision files ──
  const caneyMigs = countFiles(
    join(REPO_ROOTS.caney, "APP", "backend", "alembic", "versions"),
    ".py",
  );

  // ── AGB-CRM: count Drizzle pgTable declarations ──
  const crmTables = drizzleTables(join(REPO_ROOTS.crm, "db", "schema.ts"));

  // Representative entity nodes for CRM (real table names, bucketed by domain).
  // A handful per system gives the drill-down some depth without flooding L3.
  const crmEntitySeeds = [
    "contacts", "projects", "meetings", "research_notes", "fin_accounts",
    "email_threads", "partner_rooms", "overlord_tasks", "voice_notes",
    "pitch_feedback_campaigns", "reminders", "mcp_oauth_clients",
  ];
  for (const t of crmEntitySeeds) {
    if (!crmTables.includes(t)) continue;
    const d = bucketByKeyword(t.replace(/_/g, "-"), CRM_DOMAINS);
    if (!d) continue;
    nodes.push(
      entityNode({
        id: `crm.entity.${t}`,
        label: t,
        parentId: d.id,
        system: "crm",
        source: "migrations",
        state: "done",
        docs_ref: "db/schema.ts",
      }),
    );
  }

  // A few representative VAV entities (canonical PMS tables → domains).
  const vavEntitySeeds = [
    { t: "pms_availability", d: "vav.pms-integration" },
    { t: "pms_holds", d: "vav.booking" },
    { t: "quotes", d: "vav.booking" },
    { t: "guest_bookings", d: "vav.booking" },
    { t: "stripe_webhook_events", d: "vav.payments" },
  ];
  for (const { t, d } of vavEntitySeeds) {
    nodes.push(
      entityNode({
        id: `vav.entity.${t}`,
        label: t,
        parentId: d,
        system: "vav",
        source: "migrations",
        state: "done",
        docs_ref: "supabase/migrations",
      }),
    );
  }

  // A few representative CaneyCloud entities.
  const caneyEntitySeeds = [
    { t: "bookings", d: "caney.booking-core" },
    { t: "availability", d: "caney.availability" },
    { t: "rate_plans", d: "caney.pricing" },
    { t: "invoices", d: "caney.payments" },
    { t: "acc_journal_entries", d: "caney.accounting" },
  ];
  for (const { t, d } of caneyEntitySeeds) {
    nodes.push(
      entityNode({
        id: `caney.entity.${t}`,
        label: t,
        parentId: d,
        system: "caney",
        source: "migrations",
        state: "done",
        docs_ref: "APP/backend/alembic/versions",
      }),
    );
  }

  return {
    counts: {
      vavMig: vavMigs.length,
      caneyMig: caneyMigs.length,
      crmTables: crmTables.length,
    },
    nodes,
  };
}
