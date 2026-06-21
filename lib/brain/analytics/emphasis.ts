/**
 * THE BRAIN — per-node emphasis map (analytics overlay → canvas).
 *
 * Projects the graphology insights (computeInsights) down to a single lookup the
 * node components consume: a node id → "hub" | "orphan" verdict.
 *
 *   • hub    — a high-degree node in the dependency graph (integration
 *              choke-point / god-object). Surfaced on the canvas as a lighter
 *              chip + accent-tinted border + a small corner marker.
 *   • orphan — a domain with ZERO mapped data-flow (a blind spot). Dimmed +
 *              desaturated, reusing the same fade language the design system
 *              already applies to `needed` / dead nodes.
 *
 * Hub wins over orphan (they are disjoint anyway — a hub has edges, an orphan
 * has none). Computed ONCE from the static graph at module load: deterministic,
 * no per-render cost. Visual treatment is glow-free (NFR-A11Y-6): elevation via
 * surface lightness + a crisp marker, never a neon halo.
 */

import { graph } from "../data/graph";
import { computeInsights } from "./insights";

export type NodeEmphasis = "hub" | "orphan";

export interface EmphasisEntry {
  kind: NodeEmphasis;
  /** Dependency degree for hubs (0 for orphans) — drives the marker/title. */
  degree: number;
}

function build(): Map<string, EmphasisEntry> {
  const ins = computeInsights(graph);
  const m = new Map<string, EmphasisEntry>();
  for (const h of ins.hubs) m.set(h.id, { kind: "hub", degree: h.degree });
  for (const g of ins.coverageGaps) {
    if (!m.has(g.id)) m.set(g.id, { kind: "orphan", degree: 0 });
  }
  return m;
}

/** node id → emphasis verdict, computed once from the active graph. */
export const NODE_EMPHASIS: ReadonlyMap<string, EmphasisEntry> = build();

/** Emphasis verdict for a node id, or undefined when it is neither. */
export function emphasisOf(id: string): EmphasisEntry | undefined {
  return NODE_EMPHASIS.get(id);
}
