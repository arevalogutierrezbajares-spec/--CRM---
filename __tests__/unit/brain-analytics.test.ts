/**
 * THE BRAIN — graphology analytics overlay (Concern 3 gap-finding).
 *
 * Locks the contract of computeInsights(): cross-system cycle detection, hub
 * ranking, coverage-gap surfacing, and DETERMINISM (same graph → identical
 * insights). Also asserts the overlay holds against the real generated artifact
 * — including the live CaneyCloud ⇄ AGB-CRM dependency cycle.
 */

import { describe, it, expect } from "vitest";
import { computeInsights, emphasisOf } from "@/lib/brain/analytics";
import { graph as realGraph } from "@/lib/brain";
import type {
  BrainGraph,
  BrainNode,
  BrainEdge,
  EdgeKind,
  EdgeSubtype,
  NodeLevel,
  NodeKind,
  System,
} from "@/lib/brain/types";

function node(
  id: string,
  level: NodeLevel,
  parentId: string | null,
  system: System,
  kind: NodeKind = level === 3 ? "surface" : level === 2 ? "domain" : "system",
): BrainNode {
  return {
    id,
    level,
    kind,
    parentId,
    label: id,
    system,
    source: "openapi",
    hosted_by: null,
    fn: null,
    state: "done",
    liveness: null,
    size: "md",
    owner: null,
    branch: null,
    last_commit: null,
    docs_ref: null,
    surfaces: [],
    meta: null,
    summary: null,
    pos: { x: 0, y: 0 },
  };
}

function edge(
  id: string,
  kind: EdgeKind,
  from: { system: System; domain: string },
  to: { system: System; domain: string },
  extra: { subtype?: EdgeSubtype; route?: string; purpose?: string } = {},
): BrainEdge {
  return {
    id,
    kind,
    subtype: extra.subtype ?? null,
    from,
    to,
    contract_status: "live",
    ...(extra.route ? { route: extra.route } : {}),
    ...(extra.purpose ? { purpose: extra.purpose } : {}),
  };
}

// caney.messaging → crm.intelligence and crm.projects → caney.properties form a
// caney⇄crm cycle. crm.surface.writer → {a,b,c} is a degree-3 hub.
// crm.lonely is a domain with no semantic edge (a coverage gap).
const G: BrainGraph = {
  version: "1.1",
  generatedAt: "2026-06-21T00:00:00.000Z",
  commit: { vav: null, caney: null, crm: null, restaurants: null, academy: null },
  nodes: [
    node("caney", 1, null, "caney"),
    node("crm", 1, null, "crm"),
    node("caney.messaging", 2, "caney", "caney"),
    node("caney.properties", 2, "caney", "caney"),
    node("crm.intelligence", 2, "crm", "crm"),
    node("crm.projects", 2, "crm", "crm"),
    node("crm.lonely", 2, "crm", "crm"),
    node("crm.surface.writer", 3, "crm.projects", "crm"),
    node("crm.entity.a", 3, "crm.projects", "crm", "entity"),
    node("crm.entity.b", 3, "crm.projects", "crm", "entity"),
    node("crm.entity.c", 3, "crm.projects", "crm", "entity"),
  ],
  edges: [
    edge("ix1", "interchange", { system: "caney", domain: "caney.messaging" }, { system: "crm", domain: "crm.intelligence" }, { route: "MCP client → CRM", purpose: "messaging calls CRM tools" }),
    edge("ix2", "interchange", { system: "crm", domain: "crm.projects" }, { system: "caney", domain: "caney.properties" }, { route: "posada onboarding", purpose: "CRM pushes posada profile" }),
    edge("rw1", "reads_writes", { system: "crm", domain: "crm.surface.writer" }, { system: "crm", domain: "crm.entity.a" }, { subtype: "writes" }),
    edge("rw2", "reads_writes", { system: "crm", domain: "crm.surface.writer" }, { system: "crm", domain: "crm.entity.b" }, { subtype: "writes" }),
    edge("rw3", "reads_writes", { system: "crm", domain: "crm.surface.writer" }, { system: "crm", domain: "crm.entity.c" }, { subtype: "reads" }),
    // hierarchy — MUST be ignored by the analytics:
    edge("c1", "contains", { system: "crm", domain: "crm" }, { system: "crm", domain: "crm.lonely" }),
    edge("c2", "contains", { system: "crm", domain: "crm.projects" }, { system: "crm", domain: "crm.surface.writer" }),
  ],
  functions: [],
  externals: [],
};

describe("brain analytics: computeInsights", () => {
  const ins = computeInsights(G);

  it("counts only semantic edges (ignores contains hierarchy)", () => {
    expect(ins.semanticEdgeCount).toBe(5);
  });

  it("detects the cross-system cycle CaneyCloud ⇄ AGB-CRM", () => {
    expect(ins.crossSystemCycles).toHaveLength(1);
    const cyc = ins.crossSystemCycles[0];
    expect(cyc.systems).toEqual(["caney", "crm"]);
    expect(cyc.label).toBe("CaneyCloud ⇄ AGB-CRM");
    expect(cyc.via).toHaveLength(2);
  });

  it("ranks the degree-3 surface as the top hub and drops degree<2 nodes", () => {
    expect(ins.hubs[0].id).toBe("crm.surface.writer");
    expect(ins.hubs[0].degree).toBe(3);
    expect(ins.hubs[0].outDegree).toBe(3);
    // the four single-link interchange domains never qualify as hubs:
    expect(ins.hubs.every((h) => h.degree >= 2)).toBe(true);
    expect(ins.hubs.some((h) => h.id === "caney.messaging")).toBe(false);
  });

  it("flags only the domain with no data-flow as a coverage gap", () => {
    expect(ins.coverageGaps.map((g) => g.id)).toEqual(["crm.lonely"]);
    expect(ins.coverage).toEqual({ domains: 5, mapped: 4, pct: 80 });
  });

  it("clusters the connected semantic nodes into communities", () => {
    // every community is size ≥ 2 and the cycle members land in a cross-system one
    expect(ins.communities.every((c) => c.size >= 2)).toBe(true);
    expect(ins.communities.some((c) => c.crossSystem)).toBe(true);
  });

  it("is deterministic — identical insights across repeated runs", () => {
    expect(computeInsights(G)).toEqual(computeInsights(G));
  });
});

describe("brain analytics: real generated artifact", () => {
  const ins = computeInsights(realGraph);

  it("produces a well-formed overlay over the live graph", () => {
    expect(ins.semanticEdgeCount).toBeGreaterThan(0);
    expect(ins.coverage.pct).toBeGreaterThan(0);
    expect(ins.coverage.pct).toBeLessThan(100); // extraction is partial — gaps exist
    // hubs come pre-sorted by descending degree
    for (let i = 1; i < ins.hubs.length; i++) {
      expect(ins.hubs[i - 1].degree).toBeGreaterThanOrEqual(ins.hubs[i].degree);
    }
  });

  it("surfaces the live CaneyCloud ⇄ AGB-CRM dependency cycle", () => {
    const hasCaneyCrm = ins.crossSystemCycles.some(
      (c) => c.systems.includes("caney") && c.systems.includes("crm"),
    );
    expect(hasCaneyCrm).toBe(true);
  });

  it("is deterministic on the real graph too", () => {
    expect(computeInsights(realGraph)).toEqual(computeInsights(realGraph));
  });
});

describe("brain analytics: emphasisOf (canvas overlay map)", () => {
  it("flags the top integration hub", () => {
    expect(emphasisOf("vav.surface.post-api-holds")?.kind).toBe("hub");
    expect(emphasisOf("crm.projects")?.kind).toBe("hub");
  });

  it("flags an unmapped domain as a blind-spot orphan", () => {
    expect(emphasisOf("caney.accounting")?.kind).toBe("orphan");
  });

  it("leaves mapped non-hub domains unemphasized", () => {
    // vav.booking has mapped data-flow (via its child surfaces) but is not itself
    // a high-degree node — so neither hub nor orphan.
    expect(emphasisOf("vav.booking")).toBeUndefined();
  });
});
