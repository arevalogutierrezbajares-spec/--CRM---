/**
 * THE BRAIN — shared lens edge mapping.
 *
 * Every lens used to inline `source: e.from.system, target: e.to.system` — five
 * copies of the same bug that mapped drill-level edges to system ids no visible
 * node owned, so React Flow silently dropped them (the "edges vanish when you
 * zoom in" defect). All five now funnel through this one mapper, which resolves
 * endpoints via `renderedEndpoints` (the same resolver `visibleEdges` filters
 * by), so the membership check and the render can never disagree. PURE.
 */

import type { BrainEdge, BrainGraph } from "../types";
import { renderedEndpoints, visibleEdges, type VisibleQuery } from "../selectors";
import type { LensKey, RFEdge } from "./types";

/**
 * Map the visible edges to React-Flow-ready `RFEdge`s for a lens. `dimFn` is the
 * only per-lens difference (which edges that lens recedes).
 */
export function mapEdges(
  graph: BrainGraph,
  q: VisibleQuery,
  lens: LensKey,
  dimFn: (e: BrainEdge) => boolean,
): RFEdge[] {
  return visibleEdges(graph, q).map((e) => {
    const { source, target } = renderedEndpoints(e, q.level);
    return {
      id: e.id,
      source,
      target,
      type: e.kind === "interchange" ? "station" : "spoke",
      data: { edge: e, lens, dimmed: dimFn(e) },
    };
  });
}
