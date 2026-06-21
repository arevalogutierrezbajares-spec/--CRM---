/**
 * THE BRAIN — surface→table micro-edge extractor (the "40-blocker"). PHASE 1: CRM.
 *
 * Emits L3 `reads_writes` (route→table) edges so L2 shows the true micro-wiring
 * ("/api/capture/members touches the contacts table") instead of only the
 * structural domain→surface spokes. See docs/brain-surface-edges-plan.md.
 *
 * HONESTY (NFR-SEC-3, "derived not drawn", mirrors interchange-detector.mjs):
 * an edge is emitted ONLY when a table identifier literally appears in the
 * route's handler source (or a module it directly imports) — the on-disk
 * signature. No heuristic fan-out. Read-only; never throws — a missing or
 * unreadable file warns and is skipped.
 *
 * Phase coverage: CRM (Next + Drizzle) and VAV (Next + Supabase) are live here —
 * `walkAppRoutes` resolves handlers, table names come off the entity nodes, and
 * OpenAPI `{param}` paths are normalized to App-Router `[param]` for the lookup.
 * Caney (Python / SQLAlchemy) is Phase 3 — see the plan.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { edge } from "../lib/emit.mjs";
import { REPO_ROOTS } from "../config.mjs";
import { walkAppRoutes, resolveAppDir } from "../lib/fs-routes.mjs";

/** Systems whose handlers are file-resolvable today (Phase 1). */
const ENABLED_SYSTEMS = new Set(["crm", "vav"]);

/** Max reads_writes edges kept per route surface (NFR-SCALE legibility). */
const MAX_EDGES_PER_SURFACE = 4;

/* ── Pure helpers (unit-testable in isolation) ───────────────────────────── */

/**
 * Whole-identifier match: true when `token` appears in `src` on identifier
 * boundaries (so "quotes" matches `db.insert(quotes)` but NOT "quotest"). PURE.
 */
export function wordBoundaryMatch(src, token) {
  if (!src || !token) return false;
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_])${esc}([^A-Za-z0-9_]|$)`).test(src);
}

/** Classify a table reference as read vs write by ops present near it. PURE.
 * (Kept for the Phase-2 read/write subtype; the v1 edge stays kind-only.) */
export function classifyAccess(src) {
  return /\b(insert|update|delete|upsert)\b|\.set\(|INSERT|UPDATE|DELETE/.test(src)
    ? "write"
    : "read";
}

/** snake_case → camelCase (Drizzle binding for a snake table name). PURE. */
export function snakeToCamel(s) {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/** The route path of a surface node (strip a leading HTTP method if present). */
function routeOf(surface) {
  const label = String(surface.label ?? "").trim();
  return label.includes(" ") ? label.split(/\s+/).pop() : label;
}

/** Canonicalize a route so OpenAPI `{slug}` and App-Router `[slug]` params
 * compare equal (both → `:p`), letting OpenAPI-derived surfaces resolve to their
 * `[param]` handler files. PURE. */
export function canonicalRoute(routePath) {
  return String(routePath)
    .replace(/\[[^\]]+\]/g, ":p")
    .replace(/\{[^}]+\}/g, ":p");
}

/** Table identifiers to look for: the snake table name + its camelCase binding. */
function tokensFor(entityNode) {
  const name = String(entityNode.label ?? entityNode.id.split(".").pop() ?? "");
  return [...new Set([name, snakeToCamel(name)])].filter(Boolean);
}

/* ── File resolution ─────────────────────────────────────────────────────── */

/** route path → absolute handler file, for a Next.js system (read-only). */
function buildHandlerFileMap(system) {
  const map = new Map();
  const root = REPO_ROOTS[system];
  if (!root) return map;
  const appDir = resolveAppDir(root);
  if (!appDir) return map;
  for (const seg of walkAppRoutes(appDir).segments) {
    if (seg.kind === "route") map.set(canonicalRoute(seg.routePath), seg.file);
  }
  return map;
}

/** The schema DEFINITION file lists every `pgTable` — gathering it would make
 * every route "match" every table (a false-positive barrel). We want USAGE
 * sites, not the definition, so these are excluded from import-following. */
function isSchemaDefinition(absPath) {
  return /[/\\]schema\.ts$/.test(absPath) || /[/\\]db[/\\]schema[/\\]/.test(absPath);
}

/** Resolve a relative (`./`,`../`) or alias (`@/`) import to an absolute file. */
function resolveImport(spec, fromFile, repoRoot) {
  let base;
  if (spec.startsWith("@/")) base = join(repoRoot, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // bare package import — not local, skip
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  for (const c of candidates) {
    try {
      if (existsSync(c) && statSync(c).isFile()) {
        return isSchemaDefinition(c) ? null : c;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

/**
 * The handler source the edge is derived from: the route file + the local
 * modules it DIRECTLY imports (one level). Catches the common pattern where a
 * thin route delegates to a server action / db helper — the table is still
 * referenced in the route's own call graph, so the edge is honest. Deduped.
 */
function gatherSource(file, repoRoot) {
  const parts = [];
  const seen = new Set();
  const read = (f) => {
    if (!f || seen.has(f)) return "";
    seen.add(f);
    try {
      const src = readFileSync(f, "utf8");
      parts.push(src);
      return src;
    } catch {
      return "";
    }
  };
  const routeSrc = read(file);
  const importRe = /import[^"';]*from\s*["']([^"']+)["']/g;
  let m;
  while ((m = importRe.exec(routeSrc))) {
    read(resolveImport(m[1], file, repoRoot));
  }
  return parts.join("\n");
}

/* ── Extractor ───────────────────────────────────────────────────────────── */

export function extractSurfaceEdges({ surfaceNodes = [], entityNodes = [] } = {}) {
  const edges = [];
  const systems = [...new Set(surfaceNodes.map((n) => n.system).filter(Boolean))];

  for (const system of systems) {
    if (!ENABLED_SYSTEMS.has(system)) continue; // Phase 1 = CRM only
    const repoRoot = REPO_ROOTS[system];
    if (!repoRoot) continue;

    const fileMap = buildHandlerFileMap(system);
    const routes = surfaceNodes.filter(
      (n) => n.system === system && /\.surface\./.test(n.id),
    );
    const tables = entityNodes
      .filter((n) => n.system === system && /\.entity\./.test(n.id))
      .map((node) => ({ node, tokens: tokensFor(node) }));

    for (const r of routes) {
      const file = fileMap.get(canonicalRoute(routeOf(r)));
      if (!file || !existsSync(file)) {
        if (file) {
          console.warn(`[brain:surface-edges] ${r.id} handler not found: ${file}`);
        }
        continue;
      }
      const src = gatherSource(file, repoRoot);
      if (!src) continue;

      // Only same-domain tables: these are the ones that co-render with the route
      // at the domain's L2 (both endpoints visible), and they're the relevant
      // "this domain's route touches this domain's tables" story. Cross-domain
      // data coupling is real but belongs to a future cross-domain view (Phase 2).
      const domainTables = tables.filter((t) => t.node.parentId === r.parentId);

      let count = 0;
      for (const { node: t, tokens } of domainTables) {
        if (count >= MAX_EDGES_PER_SURFACE) break;
        if (!tokens.some((tok) => wordBoundaryMatch(src, tok))) continue;
        edges.push(
          edge({
            id: `rw.${r.id}.${t.id}`,
            kind: "reads_writes",
            subtype: null,
            from: { system, domain: r.id },
            to: { system, domain: t.id },
            contract_status: "live",
          }),
        );
        count += 1;
      }
    }
  }

  // TODO(Phase 2): VAV (normalize {param}↔[param]); read/write subtype via
  // classifyAccess near each match; `calls` edges (internal fetch/imports).
  return { edges };
}
