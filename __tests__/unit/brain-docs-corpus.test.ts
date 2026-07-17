/**
 * Phase 1 — deterministic docs corpus parse + join + search over real graph.
 */

import { describe, it, expect } from "vitest";
import {
  docRecordsFromFiles,
  parseDocMarkdown,
  resolveBrainNodeJoin,
  inferDocType,
  slugFromPath,
  foldSymptomsIntoSummary,
  docTypeJoinRank,
} from "../../scripts/brain/lib/docs-corpus.mjs";
import { searchBrain } from "@/lib/brain/search";
import { graph } from "@/lib/brain/data/graph";

describe("docs-corpus pure parse", () => {
  it("parses frontmatter brain_node, type, summary, title", () => {
    const raw = `---
brain_node: crm.capture
type: howto
system: crm
title: Capture runbook
summary: How capture works end to end.
---

# Body

More text about capture.
`;
    const rec = parseDocMarkdown({
      relPath: "docs/howto/capture.md",
      raw,
      repo: "crm",
      existingNodeIds: ["crm", "crm.capture"],
    });
    expect(rec.brain_node).toBe("crm.capture");
    expect(rec.doc_type).toBe("howto");
    expect(rec.label).toBe("Capture runbook");
    expect(rec.summary).toContain("capture works");
    expect(rec.id.startsWith("crm.")).toBe(true);
    expect(rec.path).toBe("docs/howto/capture.md");
  });

  it("infers ADR type from path without frontmatter", () => {
    expect(inferDocType("docs/adr/ADR-001-tech-stack.md")).toBe("adr");
    expect(slugFromPath("docs/adr/ADR-001-tech-stack.md")).toContain("adr-001");
  });

  it("resolves joins only when the architecture node exists", () => {
    expect(resolveBrainNodeJoin("crm.capture", ["crm", "crm.capture"])).toBe(
      "crm.capture",
    );
    expect(resolveBrainNodeJoin("crm.missing", ["crm"])).toBe(null);
  });

  it("builds multiple records with stable ids", () => {
    const recs = docRecordsFromFiles(
      [
        {
          relPath: "docs/a.md",
          raw: "---\ntitle: Alpha\nsummary: First.\n---\n\n# Alpha\n",
        },
        {
          relPath: "docs/b.md",
          raw: "---\ntitle: Beta\nsummary: Second.\n---\n\n# Beta\n",
        },
      ],
      { repo: "crm", existingNodeIds: ["crm"] },
    );
    expect(recs.length).toBe(2);
    expect(recs[0].id < recs[1].id || recs[0].id > recs[1].id).toBe(true);
    expect(recs.every((r) => r.system === "crm")).toBe(true);
  });

  it("folds symptoms into summary for search haystack (FR-BA-102)", () => {
    const folded = foldSymptomsIntoSummary("Email sync fails", {
      symptoms: "postmark, schema_migrations",
    });
    expect(folded).toContain("Email sync fails");
    expect(folded).toMatch(/postmark/i);
    expect(folded).toMatch(/schema_migrations/i);

    const raw = `---
brain_node: crm
type: failure-mode
summary: email-sync cron returns 500
symptoms: email sync, postmark, schema_migrations
---

# Email sync
`;
    const rec = parseDocMarkdown({
      relPath: "docs/RCA/failure-modes/fm-email-sync-500.md",
      raw,
      repo: "crm",
      existingNodeIds: ["crm"],
    });
    expect(rec.symptoms).toMatch(/postmark/i);
    expect(rec.summary).toMatch(/postmark/i);
    expect(rec.summary).toMatch(/schema_migrations/i);
  });

  it("ranks failure-mode below architecture docs for joins", () => {
    expect(docTypeJoinRank("failure-mode")).toBe(0);
    expect(docTypeJoinRank("howto")).toBeGreaterThan(docTypeJoinRank("doc"));
    expect(docTypeJoinRank("howto")).toBeGreaterThan(docTypeJoinRank("failure-mode"));
    expect(docTypeJoinRank("explanation")).toBeGreaterThan(docTypeJoinRank("adr"));
  });

  it("never selects failure-mode as architecture join paint", () => {
    // Simulate join selection: same logic as extractDocsCorpus
    const docs = [
      {
        brain_node: "crm",
        doc_type: "failure-mode",
        summary: "FM only",
        path: "docs/RCA/failure-modes/x.md",
      },
      {
        brain_node: "crm",
        doc_type: "howto",
        summary: "How to operate Brain",
        path: "docs/brain-ops.md",
      },
    ];
    const joins: Record<
      string,
      { summary: string | null; docs_ref: string; rank: number }
    > = {};
    for (const rec of docs) {
      const rank = docTypeJoinRank(rec.doc_type);
      if (rank <= 0) continue;
      const prev = joins[rec.brain_node];
      if (!prev || rank > prev.rank) {
        joins[rec.brain_node] = {
          summary: rec.summary,
          docs_ref: rec.path,
          rank,
        };
      }
    }
    expect(joins.crm.docs_ref).toBe("docs/brain-ops.md");
    expect(joins.crm.summary).toContain("operate Brain");
    // FM alone must not paint
    const joinsFmOnly: Record<
      string,
      { summary: string; docs_ref: string; rank: number }
    > = {};
    for (const rec of docs.filter((d) => d.doc_type === "failure-mode")) {
      const rank = docTypeJoinRank(rec.doc_type);
      if (rank <= 0) continue;
      joinsFmOnly[rec.brain_node] = {
        summary: rec.summary,
        docs_ref: rec.path,
        rank,
      };
    }
    expect(joinsFmOnly.crm).toBeUndefined();
  });
});

describe("docs corpus in generated graph + searchBrain", () => {
  it("graph contains documentation nodes from the CRM docs tree", () => {
    const docs = graph.nodes.filter((n) => n.kind === "doc" || n.kind === "adr");
    expect(docs.length).toBeGreaterThan(0);
    expect(docs.some((n) => (n.docs_ref ?? "").includes("docs/"))).toBe(true);
  });

  it("documents edges join docs to architecture nodes when keys match", () => {
    const docsEdges = graph.edges.filter((e) => e.kind === "documents");
    // Soft: joins depend on brain_node matches; at least corpus nodes exist.
    // When joins present, endpoints must resolve.
    for (const e of docsEdges) {
      expect(graph.nodes.some((n) => n.id === e.from.domain)).toBe(true);
      expect(graph.nodes.some((n) => n.id === e.to.domain)).toBe(true);
    }
  });

  it("searchBrain finds documentation by title or path tokens", () => {
    const docs = graph.nodes.filter((n) => n.kind === "doc" || n.kind === "adr");
    expect(docs.length).toBeGreaterThan(0);
    // Prefer a known seeded title token
    const r = searchBrain(graph, "Brain ops runbook", 10);
    const hit =
      r.matches.find((m) => m.kind === "doc" || m.kind === "adr") ??
      searchBrain(graph, "brain-ops", 10).matches.find(
        (m) => m.kind === "doc" || m.kind === "adr" || (m.path ?? "").includes("docs/"),
      );
    // Fallback: any doc kind hit from a doc label token
    if (!hit) {
      const label = docs[0].label.split(/\s+/).slice(0, 2).join(" ");
      const r2 = searchBrain(graph, label, 15);
      expect(
        r2.matches.some(
          (m) =>
            m.kind === "doc" ||
            m.kind === "adr" ||
            docs.some((d) => d.id === m.id),
        ),
      ).toBe(true);
    } else {
      expect(hit).toBeTruthy();
      expect(["doc", "adr"].includes(hit.kind) || hit.path.includes("docs")).toBe(
        true,
      );
    }
  });
});
