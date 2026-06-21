/**
 * THE BRAIN — radial hub-and-spoke layout (Navigation lens).
 *
 * Deterministic {id:{x,y}} positions for one altitude (level), computed via
 * d3-hierarchy's stratify→tree, then projected from the tree's [angle, radius]
 * polar space onto a centered cartesian plane. NFR-LAYOUT-1: the same input
 * graph + focus always yields byte-identical coordinates (no randomness, no
 * time, no DOM measurement). Pure.
 *
 * The mockup pins L1 domains on a ring of radius ~34% around center 50/52 and
 * L2 surfaces on a ring of ~30% around 50/54. We reproduce that feel in an
 * abstract coordinate space (centered on origin); the renderer/`pin.ts` scales
 * these into the canvas. The hub itself sits at the center (0,0).
 */

import { stratify, tree, type HierarchyNode } from "d3-hierarchy";
import type { XY } from "../types";

export interface RadialInput {
  /** Node id (unique within the laid-out set). */
  id: string;
  /** Parent id, or null for the single root/hub. */
  parentId: string | null;
}

export interface RadialOptions {
  /** Radius of the first ring (abstract units). Default 340. */
  radius?: number;
  /** Per-depth radius increment. Default 320. */
  ringStep?: number;
  /** Starting angle in degrees for the first child (mockup uses -90). */
  startAngleDeg?: number;
}

const DEFAULTS: Required<RadialOptions> = {
  radius: 340,
  ringStep: 320,
  startAngleDeg: -90,
};

/**
 * Compute deterministic radial positions for a flat list of nodes that form a
 * single rooted tree. Returns a record keyed by node id. The root is placed at
 * the origin {x:0,y:0}; descendants fan out on concentric rings.
 *
 * Determinism: input order is normalized (sorted by id) before stratification,
 * and d3.tree's separation is constant, so output never depends on array order.
 */
export function radialLayout(
  nodes: RadialInput[],
  options: RadialOptions = {},
): Record<string, XY> {
  const opts = { ...DEFAULTS, ...options };
  const out: Record<string, XY> = {};
  if (nodes.length === 0) return out;

  // Normalize order for determinism (NFR-LAYOUT-1).
  const sorted = [...nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Single-node set (just a hub): center it.
  if (sorted.length === 1) {
    out[sorted[0].id] = { x: 0, y: 0 };
    return out;
  }

  let root: HierarchyNode<RadialInput>;
  try {
    root = stratify<RadialInput>()
      .id((d) => d.id)
      .parentId((d) => d.parentId ?? undefined)(sorted);
  } catch {
    // No single clean root (e.g. a sibling set with no common parent in the
    // set). Fall back to an even ring around the origin, sorted for stability.
    const n = sorted.length;
    sorted.forEach((node, i) => {
      const angle = ((opts.startAngleDeg + (i * 360) / n) * Math.PI) / 180;
      out[node.id] = {
        x: Math.cos(angle) * opts.radius,
        y: Math.sin(angle) * opts.radius,
      };
    });
    return out;
  }

  // d3 radial tree: x = angle (radians, 0..2π), y = depth-scaled radius.
  const layout = tree<RadialInput>()
    .size([2 * Math.PI, 1])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.4) / Math.max(a.depth, 1));

  layout(root);

  const offset = (opts.startAngleDeg * Math.PI) / 180;
  root.each((d) => {
    if (d.depth === 0) {
      out[d.data.id] = { x: 0, y: 0 };
      return;
    }
    // d3.tree() populates .x (angle) on every node after layout; default to 0.
    const angle = (d.x ?? 0) + offset;
    const r = opts.radius + (d.depth - 1) * opts.ringStep;
    out[d.data.id] = {
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
    };
  });

  return out;
}

/**
 * Place a flat set of sibling nodes evenly around a center hub (no parent in
 * the set). Used for L0 portfolio (system hubs around a notional center) and
 * L1 rings where the hub is rendered separately. Deterministic by sort order.
 */
export function ringLayout(
  ids: string[],
  options: RadialOptions = {},
): Record<string, XY> {
  const opts = { ...DEFAULTS, ...options };
  const out: Record<string, XY> = {};
  const sorted = [...ids].sort();
  const n = sorted.length;
  if (n === 0) return out;
  sorted.forEach((id, i) => {
    const angle = ((opts.startAngleDeg + (i * 360) / n) * Math.PI) / 180;
    out[id] = {
      x: Math.cos(angle) * opts.radius,
      y: Math.sin(angle) * opts.radius,
    };
  });
  return out;
}
