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
    const { source, target } = renderedEndpoints(
      e,
      q.level,
      q.focusSystemId ?? null,
    );
    // At L0, interchanges are subway stations. At L1+, they are bowed threads
    // (spoke type) into portal chips — station pins only work at portfolio.
    const type =
      e.kind === "interchange" && q.level === 0 ? "station" : "spoke";
    return {
      id: e.id,
      source,
      target,
      type,
      data: { edge: e, lens, dimmed: dimFn(e) },
    };
  });
}
