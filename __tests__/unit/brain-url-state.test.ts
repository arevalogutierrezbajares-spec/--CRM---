/**
 * URL deep-link parse / serialize / nav for THE BRAIN.
 */

import { describe, expect, it } from "vitest";
import {
  navFromNodeId,
  parseBrainUrl,
  serializeBrainUrl,
} from "@/lib/brain/url-state";
import type { BrainGraph } from "@/lib/brain/types";

const graph = {
  nodes: [
    {
      id: "crm",
      level: 1,
      kind: "system",
      parentId: null,
      label: "AGB-CRM",
      system: "crm",
      source: "manifest",
      hosted_by: null,
      fn: null,
      state: "done",
      liveness: null,
      size: "lg",
      surfaces: [],
      docs_ref: null,
      commit_sha: null,
      contract_hash: null,
    },
    {
      id: "crm.capture",
      level: 2,
      kind: "domain",
      parentId: "crm",
      label: "Capture",
      system: "crm",
      source: "manifest",
      hosted_by: null,
      fn: "sales",
      state: "done",
      liveness: null,
      size: "md",
      surfaces: [],
      docs_ref: null,
      commit_sha: null,
      contract_hash: null,
    },
    {
      id: "crm.capture.webhook",
      level: 3,
      kind: "surface",
      parentId: "crm.capture",
      label: "POST /webhooks",
      system: "crm",
      source: "openapi",
      hosted_by: null,
      fn: "sales",
      state: "done",
      liveness: null,
      size: "sm",
      surfaces: ["POST /webhooks"],
      docs_ref: null,
      commit_sha: null,
      contract_hash: null,
    },
  ],
  edges: [
    {
      id: "ix-test",
      kind: "interchange",
      from: { system: "crm", domain: "crm.capture" },
      to: { system: "caney", domain: "caney.auth" },
      health: "ok",
      contract_status: "live",
      purpose: "posada intake",
      contract_hash: null,
    },
  ],
  functions: [],
  meta: { generated_at: "", version: "1.1" },
} as unknown as BrainGraph;

describe("parseBrainUrl", () => {
  it("parses known params and ignores junk", () => {
    const p = parseBrainUrl(
      "?preset=operator&axis=function&lens=topology&node=crm.capture&q=booking&foo=1",
    );
    expect(p).toEqual({
      preset: "operator",
      axis: "function",
      lens: "topology",
      node: "crm.capture",
      q: "booking",
    });
  });

  it("rejects invalid enum values", () => {
    const p = parseBrainUrl("?preset=bogus&axis=sideways&lens=neon");
    expect(p).toEqual({});
  });
});

describe("serializeBrainUrl", () => {
  it("omits investor/state/system defaults", () => {
    expect(
      serializeBrainUrl({
        level: 0,
        axis: "system",
        lens: "state",
        preset: "investor",
        focusSystemId: null,
        focusDomainId: null,
        selection: null,
      }),
    ).toBe("");
  });

  it("writes drill focus and non-default lens", () => {
    const qs = serializeBrainUrl({
      level: 2,
      axis: "system",
      // agent default is topology — state is a deliberate override
      lens: "state",
      preset: "agent",
      focusSystemId: "crm",
      focusDomainId: "crm.capture",
      selection: "crm.capture.webhook",
    });
    expect(qs).toContain("preset=agent");
    expect(qs).toContain("lens=state");
    expect(qs).toContain("node=crm.capture.webhook");
  });
});

describe("navFromNodeId", () => {
  it("drills system hubs", () => {
    expect(navFromNodeId(graph, "crm")).toEqual([
      { type: "drill", nodeId: "crm", level: 1, system: "crm" },
    ]);
  });

  it("drills domain then selects surface", () => {
    expect(navFromNodeId(graph, "crm.capture.webhook")).toEqual([
      {
        type: "drill",
        nodeId: "crm.capture",
        level: 2,
        system: "crm",
        domainId: "crm.capture",
      },
      { type: "select", id: "crm.capture.webhook" },
    ]);
  });

  it("selects interchange edges", () => {
    expect(navFromNodeId(graph, "ix-test")).toEqual([
      { type: "select", id: "ix-test" },
    ]);
  });

  it("drills synthetic function hubs", () => {
    const withFn = {
      ...graph,
      functions: [{ id: "sales", name: "Sales", pct: 40 }],
    } as unknown as BrainGraph;
    expect(navFromNodeId(withFn, "fn.sales")).toEqual([
      {
        type: "drill",
        nodeId: "fn.sales",
        level: 1,
        system: null,
        fn: "sales",
      },
    ]);
  });
});
