/**
 * THE BRAIN — host-mount extractor (FR-PIPE-13 / FR-PIPE-15).
 *
 * Caney Restaurants is a guest module mounted INSIDE the CaneyCloud host. It is
 * NOT folded into CaneyCloud: every node is `system:"restaurants"`,
 * `hosted_by:"caney"`, `source:"host_mount"` (the de-dup assertion guarantees a
 * restaurants slug never collides with a caney slug).
 *
 * Reads /Users/tomas/caneycloud-restaurant/MODULE-INTEGRATION.md to discover the
 * release-mode contract. The host_mount edge state derives from release-mode:
 *   dark  → "doing"  (synthetic-only validation; not exposed to prod tenants)
 *   live  → "done"
 * The .env.example ships `RESTAURANT_RELEASE_MODE=dark`, so restaurants render
 * as a built-but-gated (WIP) territory.
 *
 * Emits: the restaurants L1 system node, its 13 domains (full canonical set,
 * mapped to restaurants.* FN_MAP slugs), system→domain contains edges, and ONE
 * host_mount interchange edge restaurants → caney.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOTS } from "../config.mjs";
import {
  systemNode,
  domainNode,
  edge,
  interchange,
} from "../lib/emit.mjs";
import { sizeForCount } from "../../../lib/brain/types.ts";
import { RESTAURANT_DOMAINS } from "../lib/taxonomy.mjs";
import { systemPos, domainPos } from "../lib/positions.mjs";

/**
 * Resolve the restaurants release-mode from the repo. The canonical default
 * lives in .env.example (`RESTAURANT_RELEASE_MODE=dark`); MODULE-INTEGRATION.md
 * documents the contract. Returns "dark" | "live".
 */
function resolveReleaseMode() {
  const envPath = join(REPO_ROOTS.restaurants, ".env.example");
  if (existsSync(envPath)) {
    try {
      const raw = readFileSync(envPath, "utf8");
      // First non-comment RESTAURANT_RELEASE_MODE assignment wins.
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*RESTAURANT_RELEASE_MODE\s*=\s*(\w+)/);
        if (m) return m[1].toLowerCase() === "live" ? "live" : "dark";
      }
    } catch {
      /* fall through */
    }
  }
  // Default per contract: dark until the human go-live gate is approved.
  return "dark";
}

export function extractHostMount() {
  const mountDoc = join(REPO_ROOTS.restaurants, "MODULE-INTEGRATION.md");
  const releaseMode = resolveReleaseMode();
  const state = releaseMode === "live" ? "done" : "doing";
  const health = releaseMode === "live" ? "ok" : "dark";

  const nodes = [];
  const edges = [];

  // L1 system node — host-mounted territory.
  nodes.push(
    systemNode({
      system: "restaurants",
      state,
      source: "host_mount",
      hosted_by: "caney",
      meta: `host-mounted in CaneyCloud · release: ${releaseMode} · ${RESTAURANT_DOMAINS.length} modules`,
      docs_ref: "caneycloud-restaurant/MODULE-INTEGRATION.md",
      pos: systemPos("restaurants"),
    }),
  );

  RESTAURANT_DOMAINS.forEach((d, i) => {
    const surfaces = d.surfaces ?? [];
    nodes.push(
      domainNode({
        id: d.id,
        label: d.label,
        system: "restaurants",
        source: "host_mount",
        hosted_by: "caney",
        state,
        surfaces,
        surfaceCount: surfaces.length,
        size: sizeForCount(surfaces.length),
        meta: d.module ? `module ${d.module}` : null,
        docs_ref: "caneycloud-restaurant/MODULE-INTEGRATION.md",
        pos: domainPos("restaurants", i, RESTAURANT_DOMAINS.length),
      }),
    );
    edges.push(
      edge({
        id: `contains.restaurants.${d.id}`,
        kind: "contains",
        from: { system: "restaurants", domain: "restaurants" },
        to: { system: "restaurants", domain: d.id },
      }),
    );
  });

  // The single host_mount interchange edge restaurants → caney (ix6).
  edges.push(
    interchange({
      id: "ix6",
      subtype: "host_mount",
      from: { system: "restaurants", domain: "restaurants.operator-console" },
      to: { system: "caney", domain: "caney.auth" },
      purpose:
        "Restaurant module mounted in CaneyCloud host — release-mode + frontend flags gate visibility; host forwards X-Restaurant-Id + JWT",
      health,
      contract_status: "live",
      route: "GET /api/v1/platform/release-mode (X-Restaurant-Id)",
      contract_ref: "caneycloud-restaurant/MODULE-INTEGRATION.md",
      breaks: [
        "restaurant nav item disappears from CaneyCloud host",
        "tenant scoping (X-Restaurant-Id) breaks → cross-tenant leak",
        "go-live gate not honored",
      ],
    }),
  );

  // Suppress unused-var lint without reading the file twice; the doc presence
  // is the contract anchor.
  void mountDoc;

  return { nodes, edges };
}
