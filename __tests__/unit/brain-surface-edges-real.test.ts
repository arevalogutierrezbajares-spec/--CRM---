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

  it("emits SCIP Caney (Python) route→table edges (precise path, BRAIN_SCIP)", () => {
    const caneyRw = readsWrites.filter((e) => e.from.system === "caney");
    // Full inventory + SCIP report: dozens of edges, not the old 3 regex hits.
    expect(caneyRw.length).toBeGreaterThanOrEqual(20);
    const pair = (fromSub: string, to: string) =>
      caneyRw.some(
        (e) => e.from.domain.includes(fromSub) && e.to.domain === to,
      );
    expect(pair("availability", "caney.entity.availability")).toBe(true);
    expect(pair("booking", "caney.entity.bookings")).toBe(true);
  });

  it("does NOT fabricate the accounting→journal-entries edge (no real reference)", () => {
    expect(
      readsWrites.some((e) => e.to.domain === "caney.entity.acc_journal_entries"),
    ).toBe(false);
  });

  it("classifies read vs write direction (subtype) on every micro-edge", () => {
    expect(readsWrites.every((e) => e.subtype === "reads" || e.subtype === "writes")).toBe(true);
    // POST /api/holds WRITES the hold/quote it creates but READS guest_bookings.
    const holds = readsWrites.filter((e) => e.from.domain === "vav.surface.post-api-holds");
    expect(holds.find((e) => e.to.domain === "vav.entity.pms_holds")?.subtype).toBe("writes");
    expect(holds.find((e) => e.to.domain === "vav.entity.guest_bookings")?.subtype).toBe("reads");
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
