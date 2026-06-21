/**
 * Phase 1 of the 40-blocker: the surface-edges extractor now emits real
 * `reads_writes` (route→table) edges into the generated graph. This guards the
 * canonical case — POST /api/holds → pms_holds / quotes / guest_bookings — end
 * to end: the edges exist in the artifact, their endpoints are real nodes, and
 * they actually render at the vav.booking L2 view.
 */

import { describe, it, expect } from "vitest";
import { graph } from "@/lib/brain/data/graph";
import { navigationLens } from "@/lib/brain/lenses/navigation";
import type { System } from "@/lib/brain/types";

const ids = new Set(graph.nodes.map((n) => n.id));
const readsWrites = graph.edges.filter((e) => e.kind === "reads_writes");

describe("brain: generated reads_writes edges (Phase 1 extractor)", () => {
  it("emits at least one reads_writes edge", () => {
    expect(readsWrites.length).toBeGreaterThan(0);
  });

  it("every reads_writes endpoint resolves to a real node (no dangling)", () => {
    const bad = readsWrites.filter(
      (e) => !ids.has(e.from.domain) || !ids.has(e.to.domain),
    );
    expect(bad).toEqual([]);
  });

  it("captures the canonical POST /api/holds → pms_holds/quotes/guest_bookings", () => {
    const targets = readsWrites
      .filter((e) => e.from.domain === "vav.surface.post-api-holds")
      .map((e) => e.to.domain);
    expect(targets).toContain("vav.entity.pms_holds");
    expect(targets).toContain("vav.entity.quotes");
    expect(targets).toContain("vav.entity.guest_bookings");
  });

  it("renders those route→table edges at the vav.booking L2 view", () => {
    const res = navigationLens(graph, {
      level: 2,
      axis: "system",
      focusSystemId: "vav" as System,
      focusDomainId: "vav.booking",
    });
    const rw = res.edges.filter((e) =>
      e.id.startsWith("rw.vav.surface.post-api-holds"),
    );
    expect(rw.length).toBeGreaterThanOrEqual(3);
    // and nothing dangles in that view
    const vis = new Set(res.nodes.map((n) => n.id));
    expect(
      res.edges.filter((e) => !vis.has(e.source) || !vis.has(e.target)),
    ).toEqual([]);
  });
});
