/**
 * THE BRAIN — Navigation lens (v0, default).
 *
 * PURE reducer: (graph, view) → { nodes, edges } with React-Flow-ready styling
 * and visibility. Navigation is the neutral lens — every node renders at full
 * emphasis; no dimming. It only resolves WHICH nodes/edges are visible at the
 * current altitude (delegated to selectors) and tags them with the data-*
 * attributes the CSS/lens selectors rely on. No refetch (NFR-PERF-2).
 */

import type { BrainGraph } from "../types";
import { isClusterNode, visibleNodes, type VisibleQuery } from "../selectors";
import type { LensResult, RFNode } from "./types";
import { mapEdges } from "./shared";

export function navigationLens(graph: BrainGraph, q: VisibleQuery): LensResult {
  const nodes: RFNode[] = visibleNodes(graph, q).map((n) => ({
    id: n.id,
    type: nodeTypeFor(n.level, isClusterNode(n)),
    position: { x: n.pos.x, y: n.pos.y },
    data: {
      node: n,
      lens: "navigation",
      emphasis: 1,
      dimmed: false,
      isCluster: isClusterNode(n),
    },
  }));

  const edges = mapEdges(graph, q, "navigation", () => false);

  return { nodes, edges };
}

/** Map a node level to its React Flow node-component key. */
export function nodeTypeFor(level: number, cluster: boolean): string {
  if (cluster) return "cluster";
  if (level <= 1) return "hub";
  if (level === 2) return "domain";
  return "surface";
}
