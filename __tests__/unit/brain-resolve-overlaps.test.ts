/**
 * The overlap-resolution pass must leave NO two bubbles overlapping (the user's
 * hard requirement), keep a pinned center fixed, and be deterministic.
 */

import { describe, it, expect } from "vitest";
import {
  resolveOverlaps,
  hasOverlap,
  type RectNode,
} from "@/lib/brain/layout/resolve-overlaps";

/** A dense, deliberately-overlapping ring of variable-width chips + a big center. */
function denseRing(n: number): RectNode[] {
  const nodes: RectNode[] = [
    { id: "center", x: -60, y: -60, w: 120, h: 120, fixed: true },
  ];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const r = 150; // intentionally too small → guaranteed overlaps
    const w = 120 + (i % 4) * 40; // variable widths 120..240
    nodes.push({
      id: `c${i}`,
      x: Math.cos(angle) * r - w / 2,
      y: Math.sin(angle) * r - 28,
      w,
      h: 56,
    });
  }
  return nodes;
}

function applied(nodes: RectNode[], gap: number): RectNode[] {
  const pos = resolveOverlaps(nodes, { gap });
  return nodes.map((n) => ({ ...n, x: pos[n.id].x, y: pos[n.id].y }));
}

describe("resolveOverlaps", () => {
  // up to NODE_CAP (30) children + the pinned center = the worst real case.
  for (const n of [6, 10, 14, 20, 30]) {
    it(`removes all overlap for a dense ring of ${n}`, () => {
      const start = denseRing(n);
      expect(hasOverlap(start)).toBe(true); // sanity: the seed overlaps
      const out = applied(start, 26);
      expect(hasOverlap(out, 0)).toBe(false); // none overlap after resolve
    });
  }

  it("keeps the pinned center exactly in place", () => {
    const start = denseRing(12);
    const pos = resolveOverlaps(start, { gap: 26 });
    expect(pos.center).toEqual({ x: -60, y: -60 });
  });

  it("is deterministic (same input → same output)", () => {
    const a = resolveOverlaps(denseRing(14), { gap: 26 });
    const b = resolveOverlaps(denseRing(14), { gap: 26 });
    expect(a).toEqual(b);
  });

  it("guarantees no overlap even for a pathological coincident seed (scale-out fallback)", () => {
    // 24 chips all stacked at the exact same point — the worst case for the
    // pairwise relaxation; the fallback must still drive it to zero overlap.
    const stacked: RectNode[] = Array.from({ length: 24 }, (_, i) => ({
      id: `s${i}`,
      x: 0,
      y: 0,
      w: 160,
      h: 56,
    }));
    const out = applied(stacked, 22);
    expect(hasOverlap(out, 0)).toBe(false);
  });

  it("is a no-op when nothing overlaps", () => {
    const spaced: RectNode[] = [
      { id: "a", x: 0, y: 0, w: 100, h: 50 },
      { id: "b", x: 400, y: 0, w: 100, h: 50 },
    ];
    const pos = resolveOverlaps(spaced, { gap: 10 });
    expect(pos.a).toEqual({ x: 0, y: 0 });
    expect(pos.b).toEqual({ x: 400, y: 0 });
  });
});
