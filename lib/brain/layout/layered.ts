/**
 * THE BRAIN — layered (elkjs) layout stub for the Topology lens (v1).
 *
 * Topology v1 will render the cross-system interchange graph as a layered
 * subway-map. v0 only scaffolds the interface: a minimal async function that
 * delegates to elkjs' "layered" algorithm and returns {id:{x,y}}. It is NOT
 * wired into v0 navigation (Topology is a v1 lens); it exists so the Topology
 * lens can call a stable signature without a later refactor.
 *
 * Shares the same {id:XY} return contract as radial.ts so `pin.ts` slots are
 * interchangeable (OQ-8: a node keeps a stable pinned slot across radial↔elk).
 */

import type { XY } from "../types";

export interface LayeredInput {
  id: string;
  /** Optional fixed node footprint (defaults applied when omitted). */
  width?: number;
  height?: number;
}

export interface LayeredEdgeInput {
  id: string;
  source: string;
  target: string;
}

export interface LayeredOptions {
  /** "RIGHT" | "DOWN" — ELK direction. Default "RIGHT". */
  direction?: "RIGHT" | "DOWN" | "LEFT" | "UP";
  /** Spacing between nodes in a layer. */
  nodeSpacing?: number;
  /** Spacing between layers. */
  layerSpacing?: number;
}

const DEFAULT_W = 160;
const DEFAULT_H = 56;

/**
 * Compute a layered layout via elkjs. Async because ELK's worker API is
 * promise-based. Returns {id:{x,y}} (top-left origin of each node box).
 *
 * v0 stub: functional but minimal. ELK is imported lazily so it never loads in
 * the v0 Navigation path (keeps the cold bundle small, NFR-PERF-1).
 */
export async function layeredLayout(
  nodes: LayeredInput[],
  edges: LayeredEdgeInput[],
  options: LayeredOptions = {},
): Promise<Record<string, XY>> {
  const out: Record<string, XY> = {};
  if (nodes.length === 0) return out;

  // Lazy import — ELK is only pulled in when Topology actually runs.
  const ELKmod = await import("elkjs/lib/elk.bundled.js");
  const ELK = ELKmod.default;
  const elk = new ELK();

  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": options.direction ?? "RIGHT",
      "elk.spacing.nodeNode": String(options.nodeSpacing ?? 48),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(
        options.layerSpacing ?? 96,
      ),
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: n.width ?? DEFAULT_W,
      height: n.height ?? DEFAULT_H,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      sources: [e.source],
      targets: [e.target],
    })),
  };

  const res = await elk.layout(graph);
  for (const child of res.children ?? []) {
    out[child.id] = { x: child.x ?? 0, y: child.y ?? 0 };
  }
  return out;
}
