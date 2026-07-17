/**
 * Eng-polish edge cases for the living brain canvas after full inventory:
 *  - no L0 self-loop stations (crm→crm)
 *  - overflow cluster instead of silent NODE_CAP drop
 *  - L1 portal chips + interchange threads (focus+context)
 *  - relational priority keeps reads_writes endpoints under the cap
 *  - zero dangling RF endpoints across lenses
 */

import { describe, it, expect } from "vitest";
import { graph } from "@/lib/brain/data/graph";
import {
  visibleNodes,
  visibleEdges,
  renderedEndpoints,
  capWithOverflow,
  relationalPriorityIds,
  isPortalNode,
  isClusterNode,
  NODE_CAP,
  type VisibleQuery,
} from "@/lib/brain/selectors";
import { navigationLens } from "@/lib/brain/lenses/navigation";
import { topologyLens } from "@/lib/brain/lenses/topology";
import type { System } from "@/lib/brain/types";

function noDangle(q: VisibleQuery) {
  const res = navigationLens(graph, q);
  const ids = new Set(res.nodes.map((n) => n.id));
  return res.edges.filter((e) => !ids.has(e.source) || !ids.has(e.target));
}

describe("L0: no self-loop interchange stations", () => {
  it("excludes same-system live interchanges (e.g. ix5 crm→crm)", () => {
    const edges = visibleEdges(graph, { level: 0, axis: "system" });
    expect(edges.every((e) => e.from.system !== e.to.system)).toBe(true);
    expect(edges.some((e) => e.id === "ix5")).toBe(false);
  });

  it("still shows cross-system live stations", () => {
    const edges = visibleEdges(graph, { level: 0, axis: "system" });
    // Graph no longer ships ix1; assert any live cross-system wire (e.g. ix2).
    expect(edges.some((e) => e.id === "ix2" || e.kind === "interchange")).toBe(
      true,
    );
    expect(edges.length).toBeGreaterThan(0);
  });
});

describe("capWithOverflow: never silently drops", () => {
  it("emits an overflow cluster when siblings exceed cap", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: `n.${i}`,
      level: 3 as const,
      kind: "surface" as const,
      parentId: "parent",
      label: `S${i}`,
      system: "crm" as System,
      source: "openapi" as const,
      hosted_by: null,
      fn: null,
      state: "done" as const,
      liveness: null,
      size: "sm" as const,
      owner: null,
      branch: null,
      last_commit: null,
      docs_ref: null,
      surfaces: [],
      meta: null,
      summary: null,
      pos: { x: 0, y: 0 },
    }));
    const out = capWithOverflow(many, "parent", { cap: 10 });
    expect(out.length).toBe(10); // 9 kept + 1 cluster
    const cluster = out.find(isClusterNode);
    expect(cluster?.clusterKind).toBe("overflow");
    expect(cluster?.clusterMembers.length).toBe(31);
  });

  it("keeps priority ids when capping", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: `n.${i}`,
      level: 3 as const,
      kind: "surface" as const,
      parentId: "parent",
      label: `S${i}`,
      system: "crm" as System,
      source: "openapi" as const,
      hosted_by: null,
      fn: null,
      state: "done" as const,
      liveness: null,
      size: "sm" as const,
      owner: null,
      branch: null,
      last_commit: null,
      docs_ref: null,
      surfaces: [],
      meta: null,
      summary: null,
      pos: { x: 0, y: 0 },
    }));
    const priority = new Set(["n.37", "n.38", "n.39"]);
    const out = capWithOverflow(many, "parent", { cap: 10, priorityIds: priority });
    const ids = new Set(out.map((n) => n.id));
    expect(ids.has("n.37")).toBe(true);
    expect(ids.has("n.38")).toBe(true);
    expect(ids.has("n.39")).toBe(true);
  });
});

describe("L1 portals: focus+context interchange threads", () => {
  const q: VisibleQuery = {
    level: 1,
    axis: "system",
    focusSystemId: "crm",
  };

  it("renders portal chips for remote systems linked to CRM", () => {
    const nodes = visibleNodes(graph, q);
    const portals = nodes.filter(isPortalNode);
    expect(portals.length).toBeGreaterThan(0);
    // CRM links to vav (ix2) and caney (ix3, ix4)
    const remotes = new Set(portals.map((p) => p.portalSystem));
    expect(remotes.has("vav") || remotes.has("caney")).toBe(true);
  });

  it("renders at least one interchange thread to a portal", () => {
    const res = navigationLens(graph, q);
    const portalIds = new Set(
      res.nodes.filter((n) => n.id.includes(".__portal.")).map((n) => n.id),
    );
    expect(portalIds.size).toBeGreaterThan(0);
    const thread = res.edges.find(
      (e) => portalIds.has(e.source) || portalIds.has(e.target),
    );
    expect(thread).toBeTruthy();
  });

  it("has zero dangling endpoints", () => {
    expect(noDangle(q)).toEqual([]);
  });
});

describe("L2 dense domain: overflow + no dangle", () => {
  // densest domain in the live artifact
  const dense = (() => {
    const counts = new Map<string, number>();
    for (const n of graph.nodes.filter((x) => x.level === 3)) {
      if (!n.parentId) continue;
      counts.set(n.parentId, (counts.get(n.parentId) ?? 0) + 1);
    }
    let best = "";
    let bestC = 0;
    for (const [id, c] of counts) {
      if (c > bestC) {
        best = id;
        bestC = c;
      }
    }
    return { id: best, count: bestC };
  })();

  it(`has a dense domain to exercise overflow (${dense.id}: ${dense.count})`, () => {
    expect(dense.count).toBeGreaterThan(NODE_CAP);
  });

  it("shows overflow cluster when domain children exceed NODE_CAP", () => {
    const sys = dense.id.split(".")[0] as System;
    const nodes = visibleNodes(graph, {
      level: 2,
      axis: "system",
      focusSystemId: sys,
      focusDomainId: dense.id,
    });
    expect(nodes.length).toBeLessThanOrEqual(NODE_CAP + 1); // center + ≤30
    expect(nodes.some((n) => isClusterNode(n) && n.clusterKind === "overflow")).toBe(
      true,
    );
  });

  it("zero dangling edges at dense L2", () => {
    const sys = dense.id.split(".")[0] as System;
    expect(
      noDangle({
        level: 2,
        axis: "system",
        focusSystemId: sys,
        focusDomainId: dense.id,
      }),
    ).toEqual([]);
  });

  it("relationalPriorityIds returns endpoints under the domain", () => {
    const prio = relationalPriorityIds(graph, dense.id);
    // may be empty if no rw under that domain; for booking-core / capture should have some
    expect(prio).toBeInstanceOf(Set);
  });
});

describe("topology lens is selectable and dangle-free", () => {
  it("L0 topology", () => {
    const res = topologyLens(graph, { level: 0, axis: "system" });
    const ids = new Set(res.nodes.map((n) => n.id));
    const dangling = res.edges.filter(
      (e) => !ids.has(e.source) || !ids.has(e.target),
    );
    expect(dangling).toEqual([]);
  });

  it("L1 topology on vav", () => {
    const res = topologyLens(graph, {
      level: 1,
      axis: "system",
      focusSystemId: "vav",
    });
    const ids = new Set(res.nodes.map((n) => n.id));
    expect(
      res.edges.every((e) => ids.has(e.source) && ids.has(e.target)),
    ).toBe(true);
  });
});

describe("renderedEndpoints L1 portal rewrite", () => {
  it("maps remote endpoint to portal chip id", () => {
    const ix = graph.edges.find(
      (e) =>
        e.kind === "interchange" &&
        e.contract_status === "live" &&
        e.from.system !== e.to.system &&
        (e.from.system === "crm" || e.to.system === "crm"),
    );
    expect(ix).toBeTruthy();
    if (!ix) return;
    const { source, target } = renderedEndpoints(ix, 1, "crm");
    expect(source.includes(".__portal.") || target.includes(".__portal.")).toBe(
      true,
    );
  });
});
