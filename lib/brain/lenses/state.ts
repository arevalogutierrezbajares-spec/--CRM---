/**
 * THE BRAIN — State lens (v0).
 *
 * PURE reducer: dims `needed` (roadmap/fog-of-war) nodes so the eye lands on
 * what's BUILT and WIP first, while keeping the roadmap visible but recessive.
 * This is the Investor preset's default lens. No refetch (NFR-PERF-2).
 *
 * The double-encoding (glyph + dashed border + opacity) lives in CSS via the
 * data-state attribute; this reducer only sets the additional `dimmed`/emphasis
 * signal the renderer reads.
 */

import type { BrainGraph } from "../types";
import { isClusterNode, visibleEdges, visibleNodes, type VisibleQuery } from "../selectors";
import type { LensResult, RFEdge, RFNode } from "./types";
import { nodeTypeFor } from "./navigation";

/** Emphasis applied to `needed` nodes under the State lens (mockup dims to .5). */
const NEEDED_EMPHASIS = 0.5;

export function stateLens(graph: BrainGraph, q: VisibleQuery): LensResult {
  const nodes: RFNode[] = visibleNodes(graph, q).map((n) => {
    const isNeeded = n.state === "needed";
    return {
      id: n.id,
      type: nodeTypeFor(n.level, isClusterNode(n)),
      position: { x: n.pos.x, y: n.pos.y },
      data: {
        node: n,
        lens: "state",
        emphasis: isNeeded ? NEEDED_EMPHASIS : 1,
        dimmed: isNeeded,
        isCluster: isClusterNode(n),
      },
    };
  });

  const edges: RFEdge[] = visibleEdges(graph, q).map((e) => ({
    id: e.id,
    source: e.from.system,
    target: e.to.system,
    type: e.kind === "interchange" ? "station" : "spoke",
    data: {
      edge: e,
      lens: "state",
      dimmed: e.contract_status === "planned",
    },
  }));

  return { nodes, edges };
}
