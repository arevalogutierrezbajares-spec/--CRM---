/**
 * THE BRAIN — surface→table micro-edge extractor (the "40-blocker"). SCAFFOLD.
 *
 * Emits L3 `reads_writes` (route→table) and `calls` (service→service) edges so
 * L2 shows the true micro-wiring ("POST /api/holds writes pms_holds/quotes/...")
 * instead of only structural domain→surface spokes. See the full plan:
 *   docs/brain-surface-edges-plan.md
 *
 * STATUS: scaffold. The control flow + the pure matcher are real; the two
 * repo-specific resolvers (`resolveHandlerFile`, `tableNamesForSystem`) are
 * TODO stubs that return empty, so this emits NOTHING today and the generated
 * artifact is unchanged. Fill the two stubs (Phase 1 = CRM) to turn it on.
 *
 * HONESTY (NFR-SEC-3, "derived not drawn", mirrors interchange-detector.mjs):
 * emit an edge ONLY when the table identifier literally appears in the route's
 * handler source (the on-disk signature). No heuristic fan-out. Read-only;
 * never throws — a missing/unreadable file warns and is skipped.
 */

import { existsSync, readFileSync } from "node:fs";

import { edge } from "../lib/emit.mjs";
import { REPO_ROOTS } from "../config.mjs";

/** Max reads_writes edges kept per route surface (NFR-SCALE legibility). */
const MAX_EDGES_PER_SURFACE = 4;

/**
 * Whole-identifier match: true when `token` appears in `src` on identifier
 * boundaries (so "quotes" matches `db.insert(quotes)` / "guest_bookings" but not
 * a coincidental substring like "quotest"). PURE — unit-testable in isolation.
 *
 * @param {string} src   handler source text
 * @param {string} token table identifier (snake or camel)
 * @returns {boolean}
 */
export function wordBoundaryMatch(src, token) {
  if (!src || !token) return false;
  // Escape regex metachars in the token, then bound by non-identifier chars.
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_])${esc}([^A-Za-z0-9_]|$)`).test(src);
}

/**
 * Classify a table reference as read vs write by the operations near it.
 * @param {string} src handler source
 * @returns {"write"|"read"}
 */
export function classifyAccess(src) {
  return /\b(insert|update|delete|upsert)\b|\.set\(|INSERT|UPDATE|DELETE/.test(src)
    ? "write"
    : "read";
}

/**
 * TODO(Phase 1 — CRM): resolve a route surface node to its handler source file.
 * CRM/VAV (Next): reuse `walkAppRoutes` (scripts/brain/lib/fs-routes.mjs) to map
 * `{system}.surface.<slug>` → the the route.ts file it came from. Caney (Python):
 * map OpenAPI operationId → `APP/backend/**` router file.
 *
 * @param {object} surface L3 route-surface node
 * @returns {string|null} absolute handler path, or null if unresolved
 */
function resolveHandlerFile(surface) {
  void surface;
  void REPO_ROOTS;
  // STUB: return null so nothing is emitted until implemented.
  return null;
}

/**
 * TODO(Phase 1 — CRM): the real table names for a system's entity nodes, keyed
 * by node id. CRM/VAV: Drizzle `pgTable("name")` (already pulled by
 * migration-entities.mjs) — include BOTH the snake table name and the camelCase
 * binding. Caney: SQLAlchemy `__tablename__` / model class.
 *
 * @param {string} system
 * @param {object[]} entityNodes L3 entity nodes for that system
 * @returns {{ node: object, tokens: string[] }[]}
 */
function tableNamesForSystem(system, entityNodes) {
  void system;
  // STUB: empty until the per-system table-name resolution lands.
  return entityNodes.map((node) => ({ node, tokens: [] }));
}

/**
 * Build reads_writes (+ later calls) edges for the live systems.
 *
 * @param {object} args
 * @param {object[]} args.surfaceNodes L3 route surfaces (from openapi-surfaces)
 * @param {object[]} args.entityNodes  L3 table entities (from migration-entities)
 * @returns {{ edges: object[] }}
 */
export function extractSurfaceEdges({ surfaceNodes = [], entityNodes = [] } = {}) {
  const edges = [];
  const systems = [...new Set(surfaceNodes.map((n) => n.system).filter(Boolean))];

  for (const system of systems) {
    const routes = surfaceNodes.filter(
      (n) => n.system === system && /\.surface\./.test(n.id),
    );
    const tables = tableNamesForSystem(
      system,
      entityNodes.filter((n) => n.system === system && /\.entity\./.test(n.id)),
    );

    for (const r of routes) {
      const file = resolveHandlerFile(r);
      if (!file || !existsSync(file)) {
        if (file) {
          console.warn(`[brain:surface-edges] ${r.id} handler not found: ${file}`);
        }
        continue;
      }
      let src;
      try {
        src = readFileSync(file, "utf8");
      } catch (err) {
        console.warn(`[brain:surface-edges] ${r.id} handler unreadable: ${err.message}`);
        continue;
      }

      let count = 0;
      for (const { node: t, tokens } of tables) {
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

  // TODO(Phase 2): `calls` edges — internal fetch('/api/...') / service imports
  // in a handler that target another route/domain → emit calls surface→surface.

  return { edges };
}
