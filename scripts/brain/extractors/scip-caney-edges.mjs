/**
 * THE BRAIN — SCIP-backed Caney route→table extractor (supersedes the regex path).
 *
 * The hand-rolled Caney path in surface-edges.mjs (operationId→handler grep +
 * db/models.py class parsing + manual import-following + a 70-char proximity
 * scan) emits only ~3 reads_writes edges — it is conservative *because* regex
 * cannot follow aliased / late / function-local / re-exported imports without
 * false positives.
 *
 * This reads a precise SCIP index (Sourcegraph scip-python, built on the real
 * pyright type-checker — see scripts/brain/scip/build-caney-index.mjs) and
 * recovers the route→table edges the regex structurally cannot: it knows that
 * `from db.models import Booking as _B` used as `select(_B)` references the
 * canonical `db.models/Booking#` symbol. On the live backend it surfaces ~85
 * route→table edges across 21 route files / 48 tables.
 *
 * HONESTY is preserved: an edge is emitted only when SCIP records a real
 * occurrence of a model symbol inside a route file (the type-checked signature,
 * strictly stronger than the on-disk token match). Read/write DIRECTION still
 * comes from the existing `accessFor` proximity heuristic (scip-python does not
 * emit usable Write/ReadAccess roles) — we feed it trustworthy edges instead of
 * regex hits. Pure parsing helpers are exported for unit tests; all file I/O is
 * isolated in `extractScipCaneyEdges`, which degrades to [] when no index exists.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOTS } from "../config.mjs";
import { accessFor } from "./surface-edges.mjs";
import { surfaceNode, entityNode, edge } from "../lib/emit.mjs";

/** SCIP SymbolRole bitfield: Definition = 1. */
const DEFINITION = 1;

/** Absolute CaneyCloud backend root (where SCIP relative paths resolve). */
export const CANEY_BACKEND = join(REPO_ROOTS.caney ?? "", "APP", "backend");

/** SCIP JSON index path: env override → conventional in-repo cache. 29MB, NOT
 * committed; produced by scripts/brain/scip/build-caney-index.mjs. */
export function scipIndexPath() {
  return process.env.BRAIN_SCIP_INDEX || join(CANEY_BACKEND, ".brain", "caney-scip.json");
}

/* ── Pure helpers (unit-testable in isolation) ───────────────────────────── */

/** True for a SCIP occurrence carrying the Definition role bit. PURE. */
export function isDefinition(occ) {
  return ((occ?.symbol_roles ?? 0) & DEFINITION) !== 0;
}

/**
 * The class name of a SCIP CLASS symbol descriptor, or null. A class ends in
 * `/Name#` (the `#` type-suffix, no trailing member like `#field.` / `#m().`).
 * e.g. "... `APP.backend.db.models`/Booking#" → "Booking". PURE.
 */
export function classNameOfSymbol(sym) {
  const m = /\/([A-Za-z_]\w*)#$/.exec(String(sym ?? ""));
  return m ? m[1] : null;
}

/**
 * Map of model-class symbol → class name: every class DEFINED in a `*models.py`
 * document. These are the ORM models route handlers reference. PURE.
 */
export function parseModelSymbols(documents = []) {
  const map = new Map();
  for (const doc of documents) {
    if (!String(doc?.relative_path ?? "").endsWith("models.py")) continue;
    for (const occ of doc.occurrences ?? []) {
      if (!isDefinition(occ)) continue;
      const cls = classNameOfSymbol(occ.symbol);
      if (cls) map.set(occ.symbol, cls);
    }
  }
  return map;
}

/** True when a SCIP document is a route handler (lives under `api/`). PURE. */
export function isRouteDoc(doc) {
  return String(doc?.relative_path ?? "").startsWith("api/");
}

/**
 * Distinct (routeFile, class) references: every model symbol that OCCURS (as a
 * non-definition use) inside a route document. PURE. Sorted for determinism.
 */
export function parseRouteTableRefs(documents = [], modelSymbols = new Map()) {
  const seen = new Set();
  const refs = [];
  for (const doc of documents) {
    if (!isRouteDoc(doc)) continue;
    const routeFile = doc.relative_path;
    const classes = new Set();
    for (const occ of doc.occurrences ?? []) {
      if (isDefinition(occ)) continue; // a use, not the model's own definition
      const cls = modelSymbols.get(occ.symbol);
      if (cls) classes.add(cls);
    }
    for (const cls of classes) {
      const key = `${routeFile}::${cls}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({ routeFile, cls });
    }
  }
  return refs.sort(
    (a, b) => a.routeFile.localeCompare(b.routeFile) || a.cls.localeCompare(b.cls),
  );
}

/**
 * Model class → table name, parsed from every `*models.py` under the backend
 * (`class X(...): ... __tablename__ = "y"`). Mirrors surface-edges.mjs but spans
 * package-local model files (e.g. comms/models.py), not just db/models.py. PURE
 * given a list of [path, source] pairs.
 */
export function parseClassTables(modelFiles = []) {
  const map = {};
  const re =
    /class\s+(\w+)\s*\([^)]*\):[\s\S]{0,500}?__tablename__\s*=\s*["'](\w+)["']/g;
  for (const [, src] of modelFiles) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(src))) map[m[1]] = m[2]; // ClassName → table
  }
  return map;
}

/* ── File I/O (isolated; degrades to empty) ──────────────────────────────── */

/** Recursively collect [absPath, source] for every `*models.py` under a dir. */
function readModelFiles(dir, out = [], depth = 0) {
  if (depth > 8) return out;
  let ents;
  try {
    ents = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    if (e.name === "__pycache__" || e.name.startsWith(".")) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) readModelFiles(full, out, depth + 1);
    else if (e.name.endsWith("models.py")) {
      try {
        out.push([full, readFileSync(full, "utf8")]);
      } catch {
        /* skip */
      }
    }
  }
  return out;
}

/**
 * Extract Caney route→table edges from the SCIP index. Returns
 * `{ edges: [{ routeFile, cls, table, direction }], stats }`. Read-only; never
 * throws — a missing index degrades to an empty result (so the default build is
 * unaffected when SCIP has not been run).
 */
export function extractScipCaneyEdges({
  indexPath = scipIndexPath(),
  backendRoot = CANEY_BACKEND,
} = {}) {
  const empty = { edges: [], stats: { routeFiles: 0, tables: 0, available: false } };
  if (!indexPath || !existsSync(indexPath)) return empty;

  let index;
  try {
    index = JSON.parse(readFileSync(indexPath, "utf8"));
  } catch {
    return empty;
  }
  const documents = index?.documents ?? [];
  if (documents.length === 0) return empty;

  const modelSymbols = parseModelSymbols(documents);
  const refs = parseRouteTableRefs(documents, modelSymbols);
  const classTables = parseClassTables(readModelFiles(backendRoot));

  // Direction reuses the existing proximity heuristic, scanning each route file
  // ONCE for write ops near the model/table identifiers.
  const srcCache = new Map();
  const srcOf = (routeFile) => {
    if (srcCache.has(routeFile)) return srcCache.get(routeFile);
    let src = "";
    try {
      src = readFileSync(join(backendRoot, routeFile), "utf8");
    } catch {
      /* keep "" */
    }
    srcCache.set(routeFile, src);
    return src;
  };

  const edges = [];
  const tablesSeen = new Set();
  for (const { routeFile, cls } of refs) {
    const table = classTables[cls];
    if (!table) continue; // class without a __tablename__ (mixin/base) — skip
    const direction = accessFor(srcOf(routeFile), [cls, table]); // "writes" | "reads"
    edges.push({ routeFile, cls, table, direction });
    tablesSeen.add(table);
  }

  const routeFiles = new Set(edges.map((e) => e.routeFile));
  return {
    edges,
    stats: { routeFiles: routeFiles.size, tables: tablesSeen.size, available: true },
  };
}

/* ── Graph integration (gated, BRAIN_SCIP=1) ─────────────────────────────────
 * Projects the SCIP edges onto Brain nodes so the jump is visible in the actual
 * artifact: one surface node per route file + one entity node per table (reusing
 * existing entity nodes where present), and the reads_writes edges between them.
 * Route files / tables are bucketed into a caney domain by keyword so surface and
 * entity co-render at that domain's L2. Default build (flag off) is untouched. */

/** Keyword → caney domain slug, applied to a route-file path then a table name. */
const CANEY_DOMAIN_RULES = [
  [/avail/i, "caney.availability"],
  [/book/i, "caney.booking-core"],
  [/quote|pricing|\brate|price/i, "caney.pricing"],
  [/propert|\broom|polic/i, "caney.properties"],
  [/channel|siteminder|\bari\b|distribut/i, "caney.channels"],
  [/messag|comm|notif|conversation|whatsapp|email|sms/i, "caney.messaging"],
  [/payment|invoice|folio|stripe|payout|refund|settle/i, "caney.payments"],
  [/account|journal|ledger|export|period/i, "caney.accounting"],
  [/auth|permission|staff|\buser|tenant|onboard|token|role/i, "caney.auth"],
];

/** Best-guess caney domain for a (routeFile, table) pair; restricted to ids that
 * actually exist, else a deterministic fallback. PURE. */
export function caneyDomainFor(routeFile, table, existingDomainIds) {
  const probe = `${routeFile} ${table}`;
  for (const [re, dom] of CANEY_DOMAIN_RULES) {
    if (re.test(probe) && existingDomainIds.has(dom)) return dom;
  }
  return existingDomainIds.has("caney.auth")
    ? "caney.auth"
    : [...existingDomainIds].sort()[0];
}

/** Filesystem-safe slug for a route file ("api/v1/admin_bookings.py" → "v1-admin_bookings"). */
function routeSlug(routeFile) {
  return routeFile
    .replace(/^api\//, "")
    .replace(/\.py$/, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Build SCIP-derived Caney nodes + reads_writes edges for the graph. Returns
 * `{ nodes, edges, stats }`. Entities reuse existing `caney.entity.<table>`
 * nodes; new tables/route-files get fresh nodes. Each table is pinned to the
 * domain of the first (sorted) route that touches it, so an edge's surface and
 * entity share a domain and co-render at L2.
 */
export function extractScipCaneyGraph({
  existingDomainIds = new Set(),
  existingEntityIds = new Set(),
  indexPath = scipIndexPath(),
} = {}) {
  const { edges: raw, stats } = extractScipCaneyEdges({ indexPath });
  if (!stats.available) return { nodes: [], edges: [], stats };

  // Deterministic order: route file, then table.
  const ordered = [...raw].sort(
    (a, b) => a.routeFile.localeCompare(b.routeFile) || a.table.localeCompare(b.table),
  );

  // Pin each table to a domain (first route that references it wins).
  const tableDomain = new Map();
  for (const e of ordered) {
    if (!tableDomain.has(e.table)) {
      tableDomain.set(e.table, caneyDomainFor(e.routeFile, e.table, existingDomainIds));
    }
  }

  const nodes = [];
  const outEdges = [];
  const madeSurface = new Set();
  const madeEntity = new Set();

  for (const { routeFile, table, cls, direction } of ordered) {
    const domain = tableDomain.get(table);
    if (!domain) continue;

    const surfId = `caney.surface.scip.${routeSlug(routeFile)}`;
    if (!madeSurface.has(surfId)) {
      madeSurface.add(surfId);
      nodes.push(
        surfaceNode({
          id: surfId,
          label: routeFile,
          parentId: domain,
          system: "caney",
          source: "openapi",
          docs_ref: routeFile,
        }),
      );
    }

    const entId = `caney.entity.${table}`;
    if (!existingEntityIds.has(entId) && !madeEntity.has(entId)) {
      madeEntity.add(entId);
      nodes.push(
        entityNode({
          id: entId,
          label: table,
          parentId: domain,
          system: "caney",
          source: "migrations",
          docs_ref: "scip:db/models.py",
          meta: cls,
        }),
      );
    }

    outEdges.push(
      edge({
        id: `rw.scip.${routeSlug(routeFile)}.${table}`,
        kind: "reads_writes",
        subtype: direction, // "reads" | "writes", from accessFor
        from: { system: "caney", domain: surfId },
        to: { system: "caney", domain: entId },
        contract_status: "live",
      }),
    );
  }

  return {
    nodes,
    edges: outEdges,
    stats: { ...stats, surfaces: madeSurface.size, entities: madeEntity.size },
  };
}
