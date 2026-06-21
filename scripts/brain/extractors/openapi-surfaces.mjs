/**
 * THE BRAIN — OpenAPI / route surface extractor (FR-PIPE-1).
 *
 * Derives L3 surface nodes (and the contains-edges that bind them to their L2
 * domain) for the three live systems:
 *   - VAV        docs/pms-integration/05-api/openapi.yaml      (parseOpenApi)
 *   - CaneyCloud APP/backend/api/openapi.yaml                  (parseOpenApi)
 *   - AGB-CRM    app/**  route.ts + page groups                (walkAppRoutes)
 *
 * Each surface is bucketed into one canonical domain via keyword matching
 * (lib/taxonomy.mjs). We emit up to ~6 representative surfaces per system to
 * keep L3 legible (NFR-SCALE: ≤30 nodes/level), and feed real path/route counts
 * into the system meta map.
 *
 * Read-only (NFR-SEC-3); a missing spec degrades to empty (never throws).
 */

import { join } from "node:path";

import { REPO_ROOTS } from "../config.mjs";
import { parseOpenApi } from "../lib/openapi.mjs";
import { walkAppRoutes, resolveAppDir } from "../lib/fs-routes.mjs";
import { surfaceNode, edge } from "../lib/emit.mjs";
import {
  bucketByKeyword,
  VAV_DOMAINS,
  CANEY_DOMAINS,
  CRM_DOMAINS,
} from "../lib/taxonomy.mjs";

const MAX_SURFACES_PER_SYSTEM = 6;

/** Slugify a path into an id-safe token. */
function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[{}]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Build surface nodes + contains edges for an OpenAPI system.
 * Picks the first surface that lands in each distinct domain, capping total.
 */
function surfacesFromOpenApi(system, absPath, domains) {
  const parsed = parseOpenApi(absPath);
  const nodes = [];
  const edges = [];
  const usedDomains = new Set();

  for (const p of parsed.paths) {
    if (nodes.length >= MAX_SURFACES_PER_SYSTEM) break;
    const label = `${p.method} ${p.path}`;
    // Prefer tag-based bucketing, fall back to path keyword bucketing.
    let domain = null;
    for (const tag of p.tags) {
      domain = bucketByKeyword(tag, domains);
      if (domain) break;
    }
    if (!domain) domain = bucketByKeyword(p.path, domains);
    if (!domain) continue;
    // One representative surface per domain for legibility.
    if (usedDomains.has(domain.id)) continue;
    usedDomains.add(domain.id);

    const id = `${system}.surface.${slug(p.method + "-" + p.path)}`;
    nodes.push(
      surfaceNode({
        id,
        label,
        parentId: domain.id,
        system,
        source: "openapi",
        state: "done",
        docs_ref: p.operationId ? `openapi#${p.operationId}` : "openapi",
      }),
    );
    edges.push(
      edge({
        id: `contains.${id}`,
        kind: "contains",
        from: { system, domain: domain.id },
        to: { system, domain: id },
      }),
    );
  }

  return { nodes, edges, pathCount: parsed.pathCount, tagCount: parsed.tagCount };
}

/** Build representative surface nodes from the CRM app-route tree. */
function surfacesFromRoutes(system, repoRoot, domains) {
  const appDir = resolveAppDir(repoRoot);
  const walked = walkAppRoutes(appDir);
  const nodes = [];
  const edges = [];
  const usedDomains = new Set();

  // Prefer API routes (machine contracts) for representative surfaces.
  const apiRoutes = walked.segments.filter(
    (s) => s.kind === "route" && s.routePath.startsWith("/api/"),
  );
  for (const seg of apiRoutes) {
    if (nodes.length >= MAX_SURFACES_PER_SYSTEM) break;
    const domain = bucketByKeyword(seg.routePath, domains);
    if (!domain) continue;
    if (usedDomains.has(domain.id)) continue;
    usedDomains.add(domain.id);

    const id = `${system}.surface.${slug(seg.routePath)}`;
    nodes.push(
      surfaceNode({
        id,
        label: seg.routePath,
        parentId: domain.id,
        system,
        source: "openapi",
        state: "done",
        docs_ref: "app/api/**/route.ts",
      }),
    );
    edges.push(
      edge({
        id: `contains.${id}`,
        kind: "contains",
        from: { system, domain: domain.id },
        to: { system, domain: id },
      }),
    );
  }

  return {
    nodes,
    edges,
    routeCount: walked.routeCount,
    pageCount: walked.pageCount,
    groups: walked.groups,
  };
}

/**
 * @returns {{ nodes, edges, counts }}
 */
export function extractOpenApiSurfaces() {
  const nodes = [];
  const edges = [];

  // VAV OpenAPI
  const vav = surfacesFromOpenApi(
    "vav",
    join(REPO_ROOTS.vav, "docs", "pms-integration", "05-api", "openapi.yaml"),
    VAV_DOMAINS,
  );
  nodes.push(...vav.nodes);
  edges.push(...vav.edges);

  // CaneyCloud OpenAPI
  const caney = surfacesFromOpenApi(
    "caney",
    join(REPO_ROOTS.caney, "APP", "backend", "api", "openapi.yaml"),
    CANEY_DOMAINS,
  );
  nodes.push(...caney.nodes);
  edges.push(...caney.edges);

  // AGB-CRM route tree
  const crm = surfacesFromRoutes("crm", REPO_ROOTS.crm, CRM_DOMAINS);
  nodes.push(...crm.nodes);
  edges.push(...crm.edges);

  return {
    nodes,
    edges,
    counts: {
      vavPaths: vav.pathCount,
      caneyPaths: caney.pathCount,
      crmRoutes: crm.routeCount,
      crmPages: crm.pageCount,
      crmGroups: crm.groups,
    },
  };
}
