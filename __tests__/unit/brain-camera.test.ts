/**
 * Camera settle options — pure framing rules for drill / zoom / resize.
 */

import { describe, it, expect } from "vitest";
import {
  BRAIN_MAX_ZOOM,
  BRAIN_MIN_ZOOM,
  BRAIN_FIT_PADDING,
  brainFitDuration,
  brainFitViewOptions,
  preferredFitNodeIds,
} from "@/lib/brain/camera";

describe("brain camera", () => {
  it("exposes stable zoom bounds", () => {
    expect(BRAIN_MIN_ZOOM).toBeGreaterThan(0);
    expect(BRAIN_MAX_ZOOM).toBeGreaterThan(BRAIN_MIN_ZOOM);
    expect(BRAIN_MAX_ZOOM).toBeLessThanOrEqual(2);
  });

  it("uses asymmetric padding so chrome does not steal the optical center", () => {
    expect(BRAIN_FIT_PADDING.bottom).toBeGreaterThan(BRAIN_FIT_PADDING.top);
    expect(BRAIN_FIT_PADDING.top).toBeGreaterThan(0.05);
    expect(BRAIN_FIT_PADDING.left).toBeGreaterThan(0);
  });

  it("gates duration on reduced motion", () => {
    expect(brainFitDuration("layout", true)).toBe(0);
    expect(brainFitDuration("layout", false)).toBeGreaterThan(0);
    expect(brainFitDuration("resize", false)).toBeLessThan(
      brainFitDuration("layout", false),
    );
  });

  it("adds air for dense graphs", () => {
    const sparse = brainFitViewOptions("layout", false, 4);
    const dense = brainFitViewOptions("layout", false, 24);
    expect(dense.padding.top).toBeGreaterThan(sparse.padding.top);
    expect(dense.maxZoom).toBe(BRAIN_MAX_ZOOM);
    expect(dense.minZoom).toBe(BRAIN_MIN_ZOOM);
  });

  it("preferredFitNodeIds returns the full set for ring framing", () => {
    const ids = preferredFitNodeIds(["crm", "a", "b"], "crm");
    expect(ids).toEqual(["crm", "a", "b"]);
    expect(preferredFitNodeIds(["a"], "missing")).toEqual(["a"]);
  });
});
