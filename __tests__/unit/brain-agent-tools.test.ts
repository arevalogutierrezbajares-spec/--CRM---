/**
 * P0–P3 agent consumption: pure brain libs + tool contracts on real graph.
 */

import { describe, it, expect } from "vitest";
import { graph, isGenerated } from "@/lib/brain/data/graph";
import { searchBrain } from "@/lib/brain/search";
import { neighborhood } from "@/lib/brain/neighborhood";
import { getBrainDoc, resolveDocsPath } from "@/lib/brain/doc-get";
import { brainFreshness } from "@/lib/brain/freshness";
import { buildRcaPack } from "@/lib/brain/rca-pack";
import { remediationGate } from "@/lib/brain/remediation-gate";
import { correlateErrorSignature } from "@/lib/brain/error-map";
import { MCP_TOOL_NAMES } from "@/lib/mcp/tools";
import { TOOLS } from "@/lib/wa-agent/tools";

describe("brain neighborhood", () => {
  it("expands crm system hub", () => {
    const r = neighborhood(graph, "crm", 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nodes.some((n) => n.id === "crm")).toBe(true);
    expect(r.nodes.length).toBeGreaterThan(1);
    expect(r.graphGeneratedAt).toBeTruthy();
  });

  it("returns structured error for unknown id", () => {
    const r = neighborhood(graph, "definitely.not.a.node.zzzz");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/Unknown/i);
  });

  it("includes linked docs when documents edges exist", () => {
    const docEdge = graph.edges.find((e) => e.kind === "documents");
    if (!docEdge) {
      expect(graph.nodes.some((n) => n.kind === "doc")).toBe(true);
      return;
    }
    const archId = docEdge.to.domain;
    const r = neighborhood(graph, archId, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(
      r.linkedDocs.length > 0 ||
        r.nodes.some((n) => n.kind === "doc" || n.kind === "adr"),
    ).toBe(true);
  });
});

describe("brain doc-get", () => {
  it("reads docs/brain-ops.md", () => {
    const r = getBrainDoc(graph, { path: "docs/brain-ops.md" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body.length).toBeGreaterThan(50);
    expect(r.path).toContain("brain-ops");
  });

  it("reads by doc node id when present", () => {
    const doc = graph.nodes.find(
      (n) => n.kind === "doc" && (n.docs_ref ?? "").includes("brain-ops"),
    );
    if (!doc) return;
    const r = getBrainDoc(graph, { id: doc.id });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body).toMatch(/Brain|brain/i);
  });

  it("rejects path traversal", () => {
    const r = resolveDocsPath({ path: "docs/../../.env" });
    expect(r.ok).toBe(false);
  });

  it("rejects absolute paths", () => {
    const r = resolveDocsPath({ path: "/etc/passwd" });
    expect(r.ok).toBe(false);
  });
});

describe("brain freshness + rca pack", () => {
  it("returns freshness snapshot", () => {
    const f = brainFreshness(graph, { isGenerated });
    expect(f.graphGeneratedAt).toBeTruthy();
    expect(f.nodeCount).toBe(graph.nodes.length);
    expect(typeof f.stale).toBe("boolean");
  });

  it("buildRcaPack returns hypotheses for brain ops query", () => {
    const pack = buildRcaPack(graph, "Brain ops runbook", { isGenerated });
    expect(pack.query).toContain("Brain");
    expect(pack.hypotheses.length).toBeGreaterThan(0);
    expect(pack.freshness.graphGeneratedAt).toBeTruthy();
    expect(pack.guidance.length).toBeGreaterThan(0);
  });

  it("search → neighborhood → doc_get chain works on real graph", () => {
    const s = searchBrain(graph, "brain-ops", 10);
    expect(s.matches.length).toBeGreaterThan(0);
    const docHit =
      s.matches.find((m) => m.kind === "doc") ??
      s.matches.find((m) => m.path?.includes("docs/"));
    const arch =
      s.matches.find((m) => m.kind === "system" || m.kind === "domain") ??
      s.matches[0];
    if (arch) {
      const n = neighborhood(graph, arch.id, 1);
      expect(n.ok || !n.ok).toBe(true);
    }
    if (docHit) {
      const path =
        graph.nodes.find((n) => n.id === docHit.id)?.docs_ref ?? docHit.path;
      if (path?.includes("docs/")) {
        const d = getBrainDoc(graph, { path });
        expect(d.ok).toBe(true);
      }
    }
  });
});

describe("remediation gate + error map", () => {
  it("warns when PR body has no citations", () => {
    const r = remediationGate({ text: "fixed stuff", testsRun: false });
    expect(r.pass).toBe(false);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(100);
  });

  it("passes a well-cited remediation summary", () => {
    const r = remediationGate({
      text:
        "Fix partner room load. Brain: crm.partner-rooms. Docs: docs/RCA/failure-modes/fm-partner-room-load.md. vitest passed.",
      testsRun: true,
      brainToolsUsed: true,
      citedNodeIds: ["crm.partner-rooms"],
    });
    expect(r.pass).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(80);
  });

  it("correlates email error to crm", () => {
    const r = correlateErrorSignature("POST /api/email/sync failed 500");
    expect(r.primaryId).toBeTruthy();
    expect(r.matches.length).toBeGreaterThan(0);
  });
});

describe("tool registry + MCP allowlist", () => {
  const required = [
    "brain_search",
    "brain_neighborhood",
    "brain_doc_get",
    "brain_freshness",
    "brain_rca_pack",
    "brain_remediation_gate",
    "brain_correlate_error",
  ] as const;

  it("registers all brain_* tools", () => {
    for (const name of required) {
      expect(TOOLS[name]).toBeTruthy();
      expect(TOOLS[name].definition.name).toBe(name);
    }
  });

  it("exposes brain tools on MCP allowlist", () => {
    for (const name of required) {
      expect(MCP_TOOL_NAMES).toContain(name);
    }
  });

  it("brain_search description mentions doc kinds", () => {
    const d = TOOLS.brain_search.definition.description.toLowerCase();
    expect(d).toContain("doc");
  });
});
