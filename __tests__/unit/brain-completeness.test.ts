import { describe, expect, it } from "vitest";
import {
  computeCompleteness,
  parseExpectedFromMeta,
} from "@/lib/brain/completeness";
import { graph } from "@/lib/brain/data/graph";
import { navFromHit } from "@/lib/brain/navigate";
import { safeToBuildMessage, searchBrain } from "@/lib/brain/search";

describe("completeness", () => {
  it("parses route counts from system meta", () => {
    expect(parseExpectedFromMeta("72 routes · 12 pages")).toBe(72);
    expect(parseExpectedFromMeta("no numbers")).toBeNull();
  });

  it("reports systems and gaps for the live graph", () => {
    const r = computeCompleteness(graph);
    expect(r.systems.length).toBeGreaterThanOrEqual(3);
    expect(r.totalSurfaces).toBeGreaterThan(50);
    expect(r.liveInterchanges).toBeGreaterThan(0);
    expect(Array.isArray(r.gaps)).toBe(true);
  });
});

describe("navFromHit", () => {
  it("drills systems to L1", () => {
    const steps = navFromHit(graph, {
      id: "crm",
      kind: "system",
      label: "AGB-CRM",
      system: "crm",
      path: "crm",
      score: 100,
    });
    expect(steps[0]).toMatchObject({ type: "drill", level: 1, system: "crm" });
  });

  it("selects interchanges", () => {
    const steps = navFromHit(graph, {
      id: "ix1",
      kind: "interchange",
      label: "wire",
      system: "vav",
      path: "vav→caney",
      score: 50,
    });
    expect(steps).toEqual([{ type: "select", id: "ix1" }]);
  });
});

describe("safeToBuildMessage", () => {
  it("uses the product phrase", () => {
    const msg = safeToBuildMessage("xyzzy-not-real");
    expect(msg).toContain("safe to build");
    expect(msg).toContain("xyzzy-not-real");
  });

  it("search empty is safeToBuild", () => {
    const r = searchBrain(graph, "definitely-not-in-graph-zzzz");
    expect(r.safeToBuild).toBe(true);
  });
});
