import { describe, expect, it } from "vitest";
import { searchBrain, buildSearchIndex } from "@/lib/brain/search";
import type { BrainGraph } from "@/lib/brain/types";

const mini: BrainGraph = {
  version: "1.1",
  generatedAt: "2026-07-17T00:00:00.000Z",
  commit: { vav: "a", caney: "b", crm: "c", restaurants: null, academy: null },
  nodes: [
    {
      id: "portfolio",
      level: 0,
      kind: "system",
      parentId: null,
      label: "Portfolio",
      system: null,
      source: "openapi",
      hosted_by: null,
      fn: null,
      state: "done",
      liveness: null,
      size: "lg",
      owner: null,
      branch: null,
      last_commit: null,
      docs_ref: null,
      surfaces: [],
      meta: null,
      summary: null,
      pos: { x: 0, y: 0 },
    },
    {
      id: "crm",
      level: 1,
      kind: "system",
      parentId: "portfolio",
      label: "AGB-CRM",
      system: "crm",
      source: "openapi",
      hosted_by: null,
      fn: null,
      state: "done",
      liveness: null,
      size: "lg",
      owner: null,
      branch: null,
      last_commit: null,
      docs_ref: null,
      surfaces: [],
      meta: null,
      summary: null,
      pos: { x: 0, y: 0 },
    },
    {
      id: "crm.surface.api-holds",
      level: 3,
      kind: "surface",
      parentId: "crm.projects",
      label: "POST /api/holds",
      system: "crm",
      source: "openapi",
      hosted_by: null,
      fn: null,
      state: "done",
      liveness: null,
      size: "sm",
      owner: null,
      branch: null,
      last_commit: null,
      docs_ref: null,
      surfaces: [],
      meta: null,
      summary: null,
      pos: { x: 0, y: 0 },
    },
  ],
  edges: [
    {
      id: "ix1",
      kind: "interchange",
      subtype: null,
      from: { system: "vav", domain: "vav.pms-integration" },
      to: { system: "caney", domain: "caney.booking-core" },
      purpose: "PMS booking sync webhook",
      health: "ok",
      contract_status: "live",
      route: "POST /api/pms/webhook/caneycloud",
      contract_ref: "docs/openapi.yaml",
      contract_hash: null,
      version: undefined,
      breaks: [],
    },
  ],
  functions: [],
  externals: [],
};

describe("brain search (rebuild-guard)", () => {
  it("finds a surface by path substring", () => {
    const r = searchBrain(mini, "holds");
    expect(r.safeToBuild).toBe(false);
    expect(r.matches.some((m) => m.id.includes("holds"))).toBe(true);
  });

  it("finds an interchange by purpose", () => {
    const r = searchBrain(mini, "booking sync");
    expect(r.matches[0]?.kind).toBe("interchange");
    expect(r.matches[0]?.id).toBe("ix1");
  });

  it("returns safeToBuild when nothing matches", () => {
    const r = searchBrain(mini, "definitely-not-a-thing-xyzzy");
    expect(r.matches).toEqual([]);
    expect(r.safeToBuild).toBe(true);
  });

  it("ranks exact id above substring", () => {
    const r = searchBrain(mini, "ix1");
    expect(r.matches[0]?.id).toBe("ix1");
  });

  it("buildSearchIndex is stable for the same graph", () => {
    const a = buildSearchIndex(mini);
    const b = buildSearchIndex(mini);
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
  });
});
