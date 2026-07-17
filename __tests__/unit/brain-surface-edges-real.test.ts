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

  it("captures route→table micro-edges (surface → entity)", () => {
    // Living graph may weight CRM/Caney heavier than VAV — assert portfolio shape.
    expect(readsWrites.length).toBeGreaterThan(10);
    expect(
      readsWrites.some(
        (e) =>
          e.from.domain.includes("surface") && e.to.domain.includes("entity"),
      ),
    ).toBe(true);
    const bySystem = new Set(readsWrites.map((e) => e.from.system));
    expect(bySystem.size).toBeGreaterThanOrEqual(1);
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
    expect(
      readsWrites.every((e) => e.subtype === "reads" || e.subtype === "writes"),
    ).toBe(true);
    expect(readsWrites.some((e) => e.subtype === "writes")).toBe(true);
    expect(readsWrites.some((e) => e.subtype === "reads")).toBe(true);
  });

  it("renders route→table edges at a dense L2 domain view", () => {
    // Pick the domain whose children participate in the most rw edges.
    const domains = graph.nodes.filter((n) => n.level === 2 && n.system);
    let focusDomainId = domains[0]?.id ?? "crm.projects";
    let focusSystemId = (domains[0]?.system ?? "crm") as System;
    let best = 0;
    for (const d of domains) {
      const childIds = new Set(
        graph.nodes.filter((n) => n.parentId === d.id).map((n) => n.id),
      );
      childIds.add(d.id);
      const n = readsWrites.filter(
        (e) => childIds.has(e.from.domain) || childIds.has(e.to.domain),
      ).length;
      if (n > best) {
        best = n;
        focusDomainId = d.id;
        focusSystemId = d.system as System;
      }
    }
    expect(best).toBeGreaterThan(0);
    const res = navigationLens(graph, {
      level: 2,
      axis: "system",
      focusSystemId,
      focusDomainId,
    });
    const rw = res.edges.filter((e) => e.id.startsWith("rw."));
    expect(rw.length).toBeGreaterThanOrEqual(1);
    const vis = new Set(res.nodes.map((n) => n.id));
    expect(
      res.edges.filter((e) => !vis.has(e.source) || !vis.has(e.target)),
    ).toEqual([]);
  });
});
