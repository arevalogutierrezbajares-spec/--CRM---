/**
 * THE BRAIN — Topology lens (v1 stub).
 *
 * Topology dims non-interchange ("non-xlink") chips and warns cross-system
 * edges, surfacing the subway-map of how systems actually connect. v0 ships a
 * working but minimal reducer (no elk layout yet — that lands with layered.ts
 * wiring in v1) so the lens toggle is selectable and degrades to Navigation
 * positioning. PURE; no refetch (NFR-PERF-2).
 */

import type { BrainGraph } from "../types";
import { isClusterNode, visibleNodes, type VisibleQuery } from "../selectors";
import type { LensResult, RFNode } from "./types";
import { nodeTypeFor } from "./navigation";
import { mapEdges } from "./shared";

/** Emphasis applied to nodes with no cross-system link under Topology. */
const NON_XLINK_EMPHASIS = 0.32;

export function topologyLens(graph: BrainGraph, q: VisibleQuery): LensResult {
  // A node "has an xlink" if it participates in any interchange edge endpoint.
  const xlinkSystems = new Set<string>();
  for (const e of graph.edges) {
    if (e.kind === "interchange") {
      xlinkSystems.add(e.from.system);
      xlinkSystems.add(e.to.system);
    }
  }

  const nodes: RFNode[] = visibleNodes(graph, q).map((n) => {
    const hasXlink = n.system != null && xlinkSystems.has(n.system);
    return {
      id: n.id,
      type: nodeTypeFor(n.level, isClusterNode(n)),
      position: { x: n.pos.x, y: n.pos.y },
      data: {
        node: n,
        lens: "topology",
        emphasis: hasXlink ? 1 : NON_XLINK_EMPHASIS,
        dimmed: !hasXlink,
        isCluster: isClusterNode(n),
      },
    };
  });

  const edges = mapEdges(
    graph,
    q,
    "topology",
    (e) => e.kind !== "interchange",
  );

  return { nodes, edges };
}
