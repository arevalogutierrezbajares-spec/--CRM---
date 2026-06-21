/**
 * THE BRAIN — Next.js App Router tree walker (shared by the surface extractor).
 *
 * Walks a Next.js `app/` directory and enumerates route segments, grouping them
 * by their nearest route-group folder (the `(group)` wrappers Next uses for
 * layout scoping without affecting the URL). Read-only (NFR-SEC-3).
 *
 * Robustness contract: a MISSING app dir returns an empty result and NEVER
 * throws, so the orchestrator runs cleanly when a repo isn't checked out.
 *
 * Detected segment files:
 *   - `route.ts` / `route.js` / `route.tsx`  → API/route handler  (kind "route")
 *   - `page.tsx` / `page.js` / `page.jsx`    → page               (kind "page")
 */

import { readdirSync, existsSync, statSync } from "node:fs";
import { join, sep } from "node:path";

const ROUTE_FILES = new Set(["route.ts", "route.js", "route.tsx"]);
const PAGE_FILES = new Set(["page.tsx", "page.jsx", "page.js"]);

/**
 * @typedef {object} RouteSegment
 * @property {"route"|"page"} kind
 * @property {string} routePath   URL-ish path (route groups stripped), e.g. "/api/contacts"
 * @property {string} group       nearest route-group folder name e.g. "(app)" or "" if none
 * @property {string} file        absolute file path
 */

/**
 * @typedef {object} FsRoutesResult
 * @property {RouteSegment[]} segments
 * @property {number} routeCount     count of route.ts handlers
 * @property {number} pageCount      count of page.tsx pages
 * @property {Record<string, number>} byGroup   segment count per route-group folder
 * @property {string[]} groups       sorted route-group folder names present
 */

function emptyResult() {
  return { segments: [], routeCount: 0, pageCount: 0, byGroup: {}, groups: [] };
}

const IGNORE_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build"]);

/**
 * Convert an array of path-segment folder names into a URL-ish route path,
 * dropping route-group `(...)` wrappers and private `_...` folders.
 * @param {string[]} parts
 */
function toRoutePath(parts) {
  const kept = parts.filter(
    (p) => !(p.startsWith("(") && p.endsWith(")")),
  );
  return "/" + kept.join("/");
}

/**
 * Walk a Next.js app directory.
 * @param {string} appDir  absolute path to the `app/` directory.
 * @returns {FsRoutesResult}
 */
export function walkAppRoutes(appDir) {
  if (!appDir || !existsSync(appDir)) return emptyResult();

  /** @type {RouteSegment[]} */
  const segments = [];

  /**
   * @param {string} dir       absolute dir being walked
   * @param {string[]} relParts folder names from appDir to `dir`
   * @param {string} group     nearest enclosing route-group folder
   */
  function walk(dir, relParts, group) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    // Deterministic order.
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const ent of entries) {
      const name = ent.name;
      const full = join(dir, name);

      if (ent.isDirectory()) {
        if (IGNORE_DIRS.has(name)) continue;
        const isGroup = name.startsWith("(") && name.endsWith(")");
        walk(full, [...relParts, name], isGroup ? name : group);
        continue;
      }

      // file
      if (ROUTE_FILES.has(name)) {
        segments.push({
          kind: "route",
          routePath: toRoutePath(relParts),
          group,
          file: full,
        });
      } else if (PAGE_FILES.has(name)) {
        segments.push({
          kind: "page",
          routePath: toRoutePath(relParts),
          group,
          file: full,
        });
      }
    }
  }

  walk(appDir, [], "");

  // Stable sort the collected segments by (routePath, kind).
  segments.sort((a, b) => {
    if (a.routePath !== b.routePath)
      return a.routePath < b.routePath ? -1 : 1;
    return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
  });

  const byGroup = {};
  for (const s of segments) {
    const g = s.group || "";
    byGroup[g] = (byGroup[g] ?? 0) + 1;
  }

  return {
    segments,
    routeCount: segments.filter((s) => s.kind === "route").length,
    pageCount: segments.filter((s) => s.kind === "page").length,
    byGroup,
    groups: Object.keys(byGroup)
      .filter((g) => g !== "")
      .sort(),
  };
}

/**
 * Resolve the conventional `app/` dir for a repo root, trying the common
 * Next.js layouts (`app/`, `src/app/`). Returns the first that exists, or
 * `null` if none.
 * @param {string} repoRoot absolute repo root
 * @returns {string|null}
 */
export function resolveAppDir(repoRoot) {
  for (const candidate of [join(repoRoot, "app"), join(repoRoot, "src", "app")]) {
    try {
      if (existsSync(candidate) && statSync(candidate).isDirectory())
        return candidate;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export { sep };
