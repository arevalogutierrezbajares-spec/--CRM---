/**
 * THE BRAIN — Liveness lens (v2 stub).
 *
 * Liveness dims `dead`/`atrophy` nodes and pulses healthy interchange stations
 * (the `beat` animation). The data needed (node.liveness) is null until the v2
 * liveness extractor lands, so v0 ships a degrade-safe reducer: it falls back
 * to Navigation emphasis when liveness is absent. PURE; no refetch.
 */

import type { BrainGraph } from "../types";
import { isClusterNode, visibleNodes, type VisibleQuery } from "../selectors";
import type { LensResult, RFNode } from "./types";
import { nodeTypeFor } from "./navigation";
import { mapEdges } from "./shared";

/** Emphasis applied to dead nodes once the v2 extractor populates liveness. */
const DEAD_EMPHASIS = 0.3;

export function livenessLens(graph: BrainGraph, q: VisibleQuery): LensResult {
  const nodes: RFNode[] = visibleNodes(graph, q).map((n) => {
    const dead = n.liveness === "dead" || n.liveness === "atrophy";
    return {
      id: n.id,
      type: nodeTypeFor(n.level, isClusterNode(n)),
      position: { x: n.pos.x, y: n.pos.y },
      data: {
        node: n,
        lens: "liveness",
        emphasis: dead ? DEAD_EMPHASIS : 1,
        dimmed: dead,
        isCluster: isClusterNode(n),
      },
    };
  });

  const edges = mapEdges(graph, q, "liveness", () => false);

  return { nodes, edges };
}
