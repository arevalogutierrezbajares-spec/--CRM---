/**
 * THE BRAIN — lens output contract.
 *
 * Lens reducers (navigation/state/topology/liveness/functionOverlay) all return
 * a `LensResult`: the React-Flow-ready node/edge arrays. These mirror the shape
 * @xyflow/react expects (`{id,type,position,data}` / `{id,source,target,...}`)
 * but stay decoupled from the library import so lib/brain remains pure and
 * server-safe. The renderer adapts `RFNode`/`RFEdge` 1:1 onto React Flow's
 * `Node`/`Edge`.
 *
 * THE node.data CONTRACT (what every custom React Flow node receives):
 *   data.node      — the full BrainNode (or ClusterNode)
 *   data.lens      — the active lens key
 *   data.emphasis  — 0..1 visual emphasis multiplier (1 = full)
 *   data.dimmed    — boolean: this node is de-emphasized by the lens
 *   data.isCluster — boolean: render the hatched roadmap-cluster variant
 *   data.fnColor?  — function-overlay accent (functionOverlay lens only)
 */

import type { BrainEdge, BrainNode } from "../types";
import type { Fn } from "../types";

export type LensKey =
  | "navigation"
  | "state"
  | "topology"
  | "liveness"
  | "function";

export interface RFNodeData {
  /** The underlying graph node (may be a synthesized cluster node). */
  node: BrainNode;
  /** Which lens produced this styling. */
  lens: LensKey;
  /** 0..1 emphasis multiplier (1 = full strength). */
  emphasis: number;
  /** Whether the lens de-emphasizes (dims) this node. */
  dimmed: boolean;
  /** True for synthesized roadmap-cluster pseudo-nodes (FR-NAV-7). */
  isCluster: boolean;
  /** Function-overlay accent hex (only set by the function lens). */
  fnColor?: string;
  /** The node's function (function lens convenience). */
  fn?: Fn | null;
}

export interface RFNode {
  id: string;
  /** Custom node-component key: "hub" | "domain" | "surface" | "cluster". */
  type: string;
  position: { x: number; y: number };
  data: RFNodeData;
}

export interface RFEdgeData {
  edge: BrainEdge;
  lens: LensKey;
  dimmed: boolean;
}

export interface RFEdge {
  id: string;
  source: string;
  target: string;
  /** Custom edge-component key: "spoke" | "station". */
  type: string;
  data: RFEdgeData;
}

export interface LensResult {
  nodes: RFNode[];
  edges: RFEdge[];
}
