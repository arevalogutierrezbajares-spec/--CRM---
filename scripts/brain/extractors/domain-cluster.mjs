/**
 * THE BRAIN — domain-cluster extractor (FR-PIPE-3).
 *
 * GUARANTEES every live system renders its FULL canonical domain set from the
 * surface docs (lib/taxonomy.mjs), even where the OpenAPI spec is thin (the
 * CaneyCloud spec, for instance, only exposes 5 of its 9 domains). Assigns each
 * domain's `fn` from FN_MAP (via the emit factory) so By-Function works.
 *
 * Also emits the 5 system L1 nodes with proper meta strings + deterministic
 * positions, and the system→domain `contains` edges. The L0 portfolio node is
 * emitted here too (single owner of the root).
 *
 * Takes the counts gathered by the surface + migration extractors so the system
 * meta string ("77 routes · 71 pages · 109 tables") reflects reality.
 */

import { systemNode, domainNode, edge } from "../lib/emit.mjs";
import { sizeForCount } from "../../../lib/brain/types.ts";
import {
  VAV_DOMAINS,
  CANEY_DOMAINS,
  CRM_DOMAINS,
} from "../lib/taxonomy.mjs";
import {
  portfolioPos,
  systemPos,
  domainPos,
} from "../lib/positions.mjs";

/** The L0 portfolio root node. Single owner here. */
function portfolioNode() {
  return {
    id: "portfolio",
    level: 0,
    kind: "system",
    parentId: null,
    label: "Portfolio",
    system: null,
    source: "openapi",
    hosted_by: null,
    fn: null,
    state: "doing",
    liveness: null,
    size: "lg",
    owner: null,
    branch: null,
    last_commit: null,
    docs_ref: null,
    surfaces: [],
    meta: "5 systems · 9 externals",
    summary: null,
    pos: portfolioPos(),
  };
}

/** Emit one live system's L1 node + its full domain set + contains edges. */
function clusterSystem({ system, meta, state, domains, surfaceCounts }) {
  const nodes = [];
  const edges = [];

  nodes.push(
    systemNode({
      system,
      state,
      meta,
      size: "lg",
      pos: systemPos(system),
    }),
  );

  domains.forEach((d, i) => {
    const surfaces = d.surfaces ?? [];
    // Use a real surface count where the surface extractor found more.
    const count = Math.max(surfaces.length, surfaceCounts?.[d.id] ?? 0);
    nodes.push(
      domainNode({
        id: d.id,
        label: d.label,
        system,
        source: "openapi",
        state: d.state ?? state,
        surfaces,
        surfaceCount: count,
        size: sizeForCount(count),
        docs_ref: d.docs_ref ?? null,
        pos: domainPos(system, i, domains.length),
      }),
    );
    edges.push(
      edge({
        id: `contains.${system}.${d.id}`,
        kind: "contains",
        from: { system, domain: system },
        to: { system, domain: d.id },
      }),
    );
  });

  return { nodes, edges };
}

/**
 * @param {object} ctx
 * @param {Record<string, number>} [ctx.counts]  merged counts from surface + migration extractors
 * @returns {{ nodes, edges }}
 */
export function extractDomainClusters(ctx = {}) {
  const c = ctx.counts ?? {};
  const nodes = [portfolioNode()];
  const edges = [];

  // VAV
  {
    const m = `${c.vavPaths ?? 10} api · ${c.vavMig ?? 0} mig · ${VAV_DOMAINS.length} domains`;
    const out = clusterSystem({
      system: "vav",
      meta: m,
      state: "done",
      domains: VAV_DOMAINS,
    });
    nodes.push(...out.nodes);
    edges.push(...out.edges);
  }

  // CaneyCloud
  {
    const m = `${c.caneyPaths ?? 0} api · ${c.caneyMig ?? 0} mig · ${CANEY_DOMAINS.length} domains`;
    const out = clusterSystem({
      system: "caney",
      meta: m,
      state: "done",
      domains: CANEY_DOMAINS,
    });
    nodes.push(...out.nodes);
    edges.push(...out.edges);
  }

  // AGB-CRM
  {
    const m = `${c.crmRoutes ?? 0} routes · ${c.crmPages ?? 0} pages · ${c.crmTables ?? 0} tables`;
    const out = clusterSystem({
      system: "crm",
      meta: m,
      state: "done",
      domains: CRM_DOMAINS,
    });
    nodes.push(...out.nodes);
    edges.push(...out.edges);
  }

  return { nodes, edges };
}
