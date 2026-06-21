/**
 * THE BRAIN — measured overlap resolution (NFR-LAYOUT: no two bubbles overlap).
 *
 * Pure, deterministic separation pass. Given nodes with REAL measured rects
 * (from React Flow after layout) it pushes any overlapping pair apart along the
 * axis of least penetration until none overlap (or `iters` is hit). The focused
 * parent can be pinned (`fixed`) so the fan stays anchored at the origin while
 * its children spread around it. Deterministic: fixed pair order + a stable
 * tie-break, so the same input always yields the same output (NFR-LAYOUT-1).
 *
 * Works in node-center space, returns top-left positions (React Flow's frame).
 */

export interface RectNode {
  id: string;
  /** top-left position (React Flow frame) */
  x: number;
  y: number;
  /** measured size */
  w: number;
  h: number;
  /** pinned — never moved (the focused hub/domain at the ring's center) */
  fixed?: boolean;
}

export interface ResolveOptions {
  /** minimum empty space between two bubbles' edges (px). */
  gap?: number;
  /** max relaxation passes. */
  iters?: number;
}

export function resolveOverlaps(
  nodes: RectNode[],
  opts: ResolveOptions = {},
): Record<string, { x: number; y: number }> {
  const gap = opts.gap ?? 22;
  const iters = opts.iters ?? 200;

  // Work in centers; remember half-extents.
  const c = nodes.map((n) => ({
    id: n.id,
    cx: n.x + n.w / 2,
    cy: n.y + n.h / 2,
    hw: n.w / 2,
    hh: n.h / 2,
    fixed: !!n.fixed,
  }));

  /** Any overlapping pair left? (internal, center-space.) */
  const anyOverlap = () => {
    for (let i = 0; i < c.length; i++) {
      for (let j = i + 1; j < c.length; j++) {
        const a = c[i];
        const b = c[j];
        if (
          a.hw + b.hw + gap - Math.abs(b.cx - a.cx) > 0 &&
          a.hh + b.hh + gap - Math.abs(b.cy - a.cy) > 0
        )
          return true;
      }
    }
    return false;
  };

  for (let it = 0; it < iters; it++) {
    let maxMove = 0;
    for (let i = 0; i < c.length; i++) {
      for (let j = i + 1; j < c.length; j++) {
        const a = c[i];
        const b = c[j];
        if (a.fixed && b.fixed) continue;

        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const ox = a.hw + b.hw + gap - Math.abs(dx); // x-overlap (incl. gap)
        const oy = a.hh + b.hh + gap - Math.abs(dy); // y-overlap (incl. gap)
        if (ox <= 0 || oy <= 0) continue; // not overlapping

        // Separate along the axis of LEAST penetration (smallest shove).
        if (ox < oy) {
          const dir = dx === 0 ? (i % 2 === 0 ? -1 : 1) : Math.sign(dx);
          if (a.fixed) b.cx += ox * dir;
          else if (b.fixed) a.cx -= ox * dir;
          else {
            a.cx -= (ox / 2) * dir;
            b.cx += (ox / 2) * dir;
          }
          maxMove = Math.max(maxMove, ox);
        } else {
          const dir = dy === 0 ? (i % 2 === 0 ? -1 : 1) : Math.sign(dy);
          if (a.fixed) b.cy += oy * dir;
          else if (b.fixed) a.cy -= oy * dir;
          else {
            a.cy -= (oy / 2) * dir;
            b.cy += (oy / 2) * dir;
          }
          maxMove = Math.max(maxMove, oy);
        }
      }
    }
    // Converged — the largest remaining shove is sub-pixel (early-exit instead
    // of burning the full iteration cap; the pairwise pass can oscillate forever
    // at the noise floor otherwise).
    if (maxMove < 0.6) break;
  }

  // GUARANTEED no-overlap fallback: if the relaxation didn't fully settle
  // (pathological coincident seeds), scale the constellation out from the origin
  // until clear. Terminates — scaling strictly increases every gap.
  for (let s = 0; s < 30 && anyOverlap(); s++) {
    for (const n of c) {
      if (n.fixed) continue;
      n.cx *= 1.08;
      n.cy *= 1.08;
    }
  }

  const out: Record<string, { x: number; y: number }> = {};
  for (const n of c) out[n.id] = { x: n.cx - n.hw, y: n.cy - n.hh };
  return out;
}

/** True if any two rects in the set overlap (within `gap`). For tests/guards. */
export function hasOverlap(nodes: RectNode[], gap = 0): boolean {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const ox = a.w / 2 + b.w / 2 + gap - Math.abs(a.x + a.w / 2 - (b.x + b.w / 2));
      const oy = a.h / 2 + b.h / 2 + gap - Math.abs(a.y + a.h / 2 - (b.y + b.h / 2));
      if (ox > 0 && oy > 0) return true;
    }
  }
  return false;
}
