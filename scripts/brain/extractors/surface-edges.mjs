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

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { edge } from "../lib/emit.mjs";
import { REPO_ROOTS } from "../config.mjs";
import { walkAppRoutes, resolveAppDir } from "../lib/fs-routes.mjs";

/** Systems whose handlers are file-resolvable (crm/vav = Next/TS; caney = Python). */
const ENABLED_SYSTEMS = new Set(["crm", "vav", "caney"]);

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

/** DB write-op signature (Drizzle / Supabase / SQLAlchemy). */
const WRITE_RE =
  /\b(insert|update|delete|upsert)\b|\.set\(|\.add\(|\.save\(|\.commit\(|INSERT|UPDATE|DELETE/;

/** Direction of a route→table reference: "writes" if a write op sits within
 * ~70 chars of any occurrence of the table token, else "reads". PURE. */
export function accessFor(src, tokens) {
  for (const tok of tokens) {
    const esc = tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^A-Za-z0-9_])${esc}([^A-Za-z0-9_]|$)`, "g");
    let m;
    while ((m = re.exec(src))) {
      const w = src.slice(Math.max(0, m.index - 70), m.index + tok.length + 70);
      if (WRITE_RE.test(w)) return "writes";
    }
  }
  return "reads";
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

/** The HTTP method of a surface ("GET /x" → "GET"), or null (CRM route labels
 * carry no method). The strongest read/write signal: GET reads, the rest may write. */
function methodOf(surface) {
  const head = String(surface.label ?? "").trim().split(/\s+/)[0];
  return /^[A-Z]+$/.test(head) ? head : null;
}

/** Read/write DIRECTION for a route→table edge. A GET/HEAD route reads; a
 * write-capable method falls back to the proximity scan (which distinguishes,
 * e.g., POST /holds writing pms_holds but reading guest_bookings). */
function directionFor(surface, src, tokens) {
  const method = methodOf(surface);
  if (method === "GET" || method === "HEAD") return "reads";
  // A POST whose path verb is read-only (compute/preview/search/…) reads despite
  // the method (the shared service module mixes write ops we'd otherwise catch).
  if (/\b(compute|preview|calculate|search|validate|check|export|lookup)\b/i.test(routeOf(surface)))
    return "reads";
  return accessFor(src, tokens);
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

/* ── Caney (Python / FastAPI / SQLAlchemy) resolution ────────────────────────
 * Caney handlers are Python, so the TS path can't resolve them. The mapping is:
 *   route → handler:  the OpenAPI operationId (carried on the surface node's
 *     docs_ref as "openapi#<id>") equals `operation_id="<id>"` in exactly one
 *     router file under APP/backend/api/ (verified by the scout).
 *   table → tokens:   the snake __tablename__ + its SQLAlchemy model class name
 *     (handlers reference the CLASS, not the raw string), parsed from db/models.py.
 *   handler source:   the route file + its one-level local imports (Python
 *     `from x import y` / `import x`), following a re-export through an __init__
 *     to the module that defines the symbol, excluding db/models.py.
 */

const CANEY_BACKEND = join(REPO_ROOTS.caney ?? "", "APP", "backend");

/** snake __tablename__ → model class name, from db/models.py. */
function caneyTableClasses() {
  const map = {};
  let src;
  try {
    src = readFileSync(join(CANEY_BACKEND, "db", "models.py"), "utf8");
  } catch {
    return map;
  }
  const re = /class\s+(\w+)\s*\([^)]*\):[\s\S]{0,400}?__tablename__\s*=\s*["'](\w+)["']/g;
  let m;
  while ((m = re.exec(src))) map[m[2]] = m[1]; // snake → ClassName
  return map;
}

/** Tokens to scan for a Caney entity: the real snake table name + its model class. */
function caneyTokensFor(node, classMap) {
  const table = String(node.label ?? node.id.split(".").pop() ?? "");
  return [...new Set([table, classMap[table]])].filter(Boolean);
}

/** OpenAPI operationId carried on a surface node (openapi-surfaces sets docs_ref). */
function opIdOf(node) {
  const d = String(node.docs_ref ?? "");
  return d.startsWith("openapi#") ? d.slice(8) : null;
}

/** Recursively find the first .py file under `dir` satisfying `pred`. */
function walkFindPy(dir, pred, depth = 0) {
  if (depth > 6) return null;
  let ents;
  try {
    ents = readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of ents) {
    if (e.name === "__pycache__") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      const r = walkFindPy(full, pred, depth + 1);
      if (r) return r;
    } else if (e.name.endsWith(".py") && pred(full)) {
      return full;
    }
  }
  return null;
}

/** Caney route surface → its handler .py file, via the operationId signature. */
function caneyHandlerFor(opId) {
  if (!opId) return null;
  const a = `operation_id="${opId}"`;
  const b = `operation_id='${opId}'`;
  return walkFindPy(join(CANEY_BACKEND, "api"), (f) => {
    try {
      const s = readFileSync(f, "utf8");
      return s.includes(a) || s.includes(b);
    } catch {
      return false;
    }
  });
}

/** Resolve a dotted Python module to a local backend file (.py or package init). */
function resolvePyModule(mod) {
  const rel = mod.replace(/\./g, "/");
  for (const c of [join(CANEY_BACKEND, `${rel}.py`), join(CANEY_BACKEND, rel, "__init__.py")]) {
    try {
      if (existsSync(c) && statSync(c).isFile()) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Isolate ONE handler function's body (the route's `def`, found via its
 * operation_id) from a router file. Critical for multi-handler package files
 * like accounting/__init__.py — scanning the whole file would false-match a
 * SIBLING handler's table refs. Falls back to the whole file if not found. */
function caneyHandlerBody(src, opId) {
  let idx = src.indexOf(`operation_id="${opId}"`);
  if (idx < 0) idx = src.indexOf(`operation_id='${opId}'`);
  if (idx < 0) return src;
  const defRe = /\n([ \t]*)(?:async\s+def|def)\s+\w+\s*\(/g;
  defRe.lastIndex = idx;
  const dm = defRe.exec(src);
  if (!dm) return src;
  const indent = dm[1];
  const start = dm.index;
  const rest = src.slice(start + dm[0].length);
  // next sibling at the same indent (decorator, def, or class) ends the body.
  const nextRe = new RegExp(`\\n${indent}(?:@|async def |def |class )`);
  const nm = nextRe.exec(rest);
  const end = nm ? start + dm[0].length + nm.index : src.length;
  return src.slice(start, end);
}

/** Handler source for a Caney route: THIS handler's body + only the local modules
 * whose imported symbols the body actually uses (so a route reads the tables its
 * call-graph touches, not its file-neighbours'), one re-export hop through an
 * __init__. Excludes db/models.py. Signature-honest — no fabricated edges. */
function gatherSourceCaney(file, opId) {
  let fileSrc;
  try {
    fileSrc = readFileSync(file, "utf8");
  } catch {
    return "";
  }
  const body = caneyHandlerBody(fileSrc, opId);
  const parts = [body];
  const seen = new Set([file]);

  // Parse imported symbol names from a `from X import ...` tail, handling
  // multi-line parenthesized blocks + `# noqa` comments + `as` aliases.
  const symbolsOf = (tail) =>
    tail
      .replace(/#[^\n]*/g, "")
      .replace(/[()]/g, "")
      .split(/[,\n]/)
      .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
      .filter((s) => /^\w+$/.test(s));

  // Module imports whose symbol the handler body references → follow them.
  const used = new Set();
  let m;
  const fromRe = /^[ \t]*from\s+([\w.]+)\s+import\s+(\([\s\S]*?\)|[^\n#]+)/gm;
  while ((m = fromRe.exec(fileSrc))) {
    if (symbolsOf(m[2]).some((n) => wordBoundaryMatch(body, n))) used.add(m[1]);
  }
  const impRe = /^[ \t]*import\s+([\w.]+)/gm;
  while ((m = impRe.exec(fileSrc))) {
    const leaf = m[1].split(".").pop();
    if (wordBoundaryMatch(body, leaf) || wordBoundaryMatch(body, m[1])) used.add(m[1]);
  }

  const readModule = (resolved, fromBody) => {
    if (!resolved || seen.has(resolved) || /db[/\\]models\.py$/.test(resolved)) return;
    seen.add(resolved);
    let s;
    try {
      s = readFileSync(resolved, "utf8");
    } catch {
      return;
    }
    parts.push(s);
    // one re-export hop: a package __init__ re-exporting `from .mod import sym`
    // that fromBody uses → follow .mod.
    if (resolved.endsWith("__init__.py")) {
      const pkgDir = dirname(resolved);
      let r;
      // Re-exports — relative (`from .service import`) OR absolute within the
      // package (`from pricing.service import`) — followed when fromBody uses the
      // symbol, to the module that DEFINES it (where the table ref lives).
      const reexp = /^[ \t]*from\s+(\.?[\w.]+)\s+import\s+(\([\s\S]*?\)|[^\n#]+)/gm;
      while ((r = reexp.exec(s))) {
        if (!symbolsOf(r[2]).some((n) => wordBoundaryMatch(fromBody, n))) continue;
        const sub = r[1].startsWith(".")
          ? join(pkgDir, `${r[1].slice(1).replace(/\./g, "/")}.py`)
          : resolvePyModule(r[1]);
        if (sub && existsSync(sub) && !seen.has(sub)) readModule(sub, fromBody);
      }
    }
  };
  for (const mod of used) readModule(resolvePyModule(mod), body);

  return parts.join("\n");
}

/* ── Extractor ───────────────────────────────────────────────────────────── */

export function extractSurfaceEdges({ surfaceNodes = [], entityNodes = [] } = {}) {
  const edges = [];
  const systems = [...new Set(surfaceNodes.map((n) => n.system).filter(Boolean))];

  for (const system of systems) {
    if (!ENABLED_SYSTEMS.has(system)) continue;
    const repoRoot = REPO_ROOTS[system];
    if (!repoRoot) continue;

    // crm/vav = Next/TS (walkAppRoutes + Drizzle bindings); caney = Python
    // (operationId grep + SQLAlchemy model classes).
    const isCaney = system === "caney";
    const fileMap = isCaney ? null : buildHandlerFileMap(system);
    const classMap = isCaney ? caneyTableClasses() : null;
    const routes = surfaceNodes.filter(
      (n) => n.system === system && /\.surface\./.test(n.id),
    );
    const tables = entityNodes
      .filter((n) => n.system === system && /\.entity\./.test(n.id))
      .map((node) => ({
        node,
        tokens: isCaney ? caneyTokensFor(node, classMap) : tokensFor(node),
      }));

    for (const r of routes) {
      const file = isCaney
        ? caneyHandlerFor(opIdOf(r))
        : fileMap.get(canonicalRoute(routeOf(r)));
      if (!file || !existsSync(file)) {
        if (file) {
          console.warn(`[brain:surface-edges] ${r.id} handler not found: ${file}`);
        }
        continue;
      }
      const src = isCaney
        ? gatherSourceCaney(file, opIdOf(r))
        : gatherSource(file, repoRoot);
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
            subtype: directionFor(r, src, tokens), // "writes" | "reads"
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
