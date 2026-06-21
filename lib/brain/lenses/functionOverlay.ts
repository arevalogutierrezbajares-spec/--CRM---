/**
 * THE BRAIN — Function-overlay lens (REAL, v0).
 *
 * PURE reducer: recolors every visible node by its business function via
 * FN_COLOR (lib/brain/functions.ts). The chip's left-border + status glyph pick
 * up `--accent` set to the function color (the renderer reads data.fnColor);
 * nodes with no `fn` are dimmed (uncategorized). No refetch (NFR-PERF-2).
 *
 * This is the lens that powers the By-Function reading of the portfolio: the
 * same spatial map, recolored by capability rather than by system.
 */

import { FN_COLOR } from "../functions";
import type { BrainGraph } from "../types";
import { isClusterNode, visibleEdges, visibleNodes, type VisibleQuery } from "../selectors";
import type { LensResult, RFEdge, RFNode } from "./types";
import { nodeTypeFor } from "./navigation";

/** Emphasis applied to uncategorized (fn === null) nodes. */
const UNCATEGORIZED_EMPHASIS = 0.4;

export function functionOverlayLens(graph: BrainGraph, q: VisibleQuery): LensResult {
  const nodes: RFNode[] = visibleNodes(graph, q).map((n) => {
    const hasFn = n.fn != null;
    return {
      id: n.id,
      type: nodeTypeFor(n.level, isClusterNode(n)),
      position: { x: n.pos.x, y: n.pos.y },
      data: {
        node: n,
        lens: "function",
        emphasis: hasFn ? 1 : UNCATEGORIZED_EMPHASIS,
        dimmed: !hasFn,
        isCluster: isClusterNode(n),
        fn: n.fn,
        fnColor: hasFn ? FN_COLOR[n.fn!] : undefined,
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
      lens: "function",
      dimmed: true,
    },
  }));

  return { nodes, edges };
}
