/**
 * Render-readiness for the 40-blocker (surface→table micro-edges).
 *
 * The data layer doesn't emit `reads_writes` / `calls` edges yet (see
 * scripts/brain/extractors/surface-edges.mjs + docs/brain-surface-edges-plan.md),
 * but the RENDER path must already surface them at drill levels so the moment
 * the extractor lands, L2 shows "this route writes these tables" with zero
 * further UI work. This test locks that contract using a synthetic graph.
 */

import { describe, it, expect } from "vitest";
import { navigationLens } from "@/lib/brain/lenses/navigation";
import type {
  BrainGraph,
  BrainNode,
  BrainEdge,
  NodeLevel,
  System,
} from "@/lib/brain/types";
import type { VisibleQuery } from "@/lib/brain/selectors";

function node(
  id: string,
  level: NodeLevel,
  parentId: string | null,
  system: System,
): BrainNode {
  return {
    id,
    level,
    kind: level === 3 ? "surface" : level === 2 ? "domain" : "system",
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
  kind: BrainEdge["kind"],
  fromId: string,
  toId: string,
  system: System,
): BrainEdge {
  return {
    id,
    kind,
    subtype: null,
    from: { system, domain: fromId },
    to: { system, domain: toId },
    contract_status: "live",
  };
}

// vav › booking › { POST /api/holds , pms_holds , quotes }
// with a reads_writes edge route→table and a calls edge surface→surface.
const graph: BrainGraph = {
  version: "1.1",
  generatedAt: "2026-06-21T00:00:00.000Z",
  commit: { vav: null, caney: null, crm: null, restaurants: null, academy: null },
  nodes: [
    node("vav", 1, null, "vav"),
    node("vav.booking", 2, "vav", "vav"),
    node("vav.surface.post-holds", 3, "vav.booking", "vav"),
    node("vav.entity.pms_holds", 3, "vav.booking", "vav"),
    node("vav.entity.quotes", 3, "vav.booking", "vav"),
  ],
  edges: [
    edge("rw1", "reads_writes", "vav.surface.post-holds", "vav.entity.pms_holds", "vav"),
    edge("rw2", "reads_writes", "vav.surface.post-holds", "vav.entity.quotes", "vav"),
    edge("call1", "calls", "vav.surface.post-holds", "vav.entity.quotes", "vav"),
  ],
  functions: [],
  externals: [],
};

const q: VisibleQuery = {
  level: 2,
  axis: "system",
  focusSystemId: "vav",
  focusDomainId: "vav.booking",
};

describe("brain: surface→table reads_writes/calls render at L2 once data exists", () => {
  const res = navigationLens(graph, q);
  const ids = new Set(res.nodes.map((n) => n.id));

  it("renders the reads_writes edges between visible surfaces", () => {
    expect(res.edges.some((e) => e.id === "rw1")).toBe(true);
    expect(res.edges.some((e) => e.id === "rw2")).toBe(true);
  });

  it("renders the calls edge", () => {
    expect(res.edges.some((e) => e.id === "call1")).toBe(true);
  });

  it("keeps every relational edge anchored to on-screen nodes (no dangling)", () => {
    const dangling = res.edges.filter(
      (e) => !ids.has(e.source) || !ids.has(e.target),
    );
    expect(dangling).toEqual([]);
  });

  it("still renders the domain→surface contains spokes alongside them", () => {
    // 3 spokes (domain→3 surfaces) + 2 reads_writes + 1 calls = 6 edges.
    expect(res.edges.length).toBe(6);
  });
});
