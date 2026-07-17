/**
 * Build a structured RCA investigation pack (no LLM).
 * search → top hits → neighborhood + docs + failure-modes + freshness.
 */

import type { BrainGraph, BrainNode } from "./types";
import { searchBrain } from "./search";
import { neighborhood } from "./neighborhood";
import { brainFreshness, type BrainFreshness } from "./freshness";

export type RcaPack = {
  query: string;
  graphGeneratedAt: string;
  freshness: BrainFreshness;
  search: ReturnType<typeof searchBrain>;
  primaryId: string | null;
  neighborhood: ReturnType<typeof neighborhood> | null;
  failureModes: Array<{
    id: string;
    label: string;
    summary: string | null;
    docs_ref: string | null;
    meta: string | null;
  }>;
  hypotheses: Array<{
    rank: number;
    nodeId: string;
    kind: string;
    label: string;
    reason: string;
    docs_ref: string | null;
  }>;
  guidance: string[];
};

function isFailureMode(n: BrainNode): boolean {
  if (n.kind !== "doc" && n.kind !== "adr") return false;
  const meta = (n.meta ?? "").toLowerCase();
  const path = (n.docs_ref ?? "").toLowerCase();
  const label = (n.label ?? "").toLowerCase();
  return (
    meta === "failure-mode" ||
    path.includes("failure-mode") ||
    path.includes("/rca/") ||
    label.includes("failure mode")
  );
}

/**
 * @param query symptom or capability string
 */
export function buildRcaPack(
  graph: BrainGraph,
  query: string,
  opts?: { searchLimit?: number; isGenerated?: boolean },
): RcaPack {
  const q = (query ?? "").trim();
  const effectiveSearch =
    q.length === 0
      ? { query: q, matches: [], safeToBuild: false as const }
      : searchBrain(graph, q, opts?.searchLimit ?? 12);

  const primary =
    effectiveSearch.matches.find(
      (m) => m.kind !== "doc" && m.kind !== "adr",
    ) ?? effectiveSearch.matches[0] ?? null;

  const neigh = primary
    ? neighborhood(graph, primary.id, 1)
    : null;

  const qTokens = q.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const failureModes = graph.nodes
    .filter(isFailureMode)
    .map((n) => {
      const hay = [n.label, n.summary, n.docs_ref, n.meta, n.id]
        .join(" ")
        .toLowerCase();
      const score = qTokens.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
      // also match if documents-edge to primary
      let linkBonus = 0;
      if (primary) {
        const linked = graph.edges.some(
          (e) =>
            e.kind === "documents" &&
            e.from.domain === n.id &&
            (e.to.domain === primary.id ||
              e.to.domain.startsWith(primary.id.split(".")[0] ?? "")),
        );
        if (linked) linkBonus = 3;
      }
      return { n, score: score + linkBonus };
    })
    .filter((x) => x.score > 0 || q.length === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ n }) => ({
      id: n.id,
      label: n.label,
      summary: n.summary,
      docs_ref: n.docs_ref,
      meta: n.meta,
    }));

  // If no token match, still surface up to 3 FMs when query non-empty
  const fms =
    failureModes.length > 0
      ? failureModes
      : graph.nodes
          .filter(isFailureMode)
          .slice(0, 3)
          .map((n) => ({
            id: n.id,
            label: n.label,
            summary: n.summary,
            docs_ref: n.docs_ref,
            meta: n.meta,
          }));

  const hypotheses = effectiveSearch.matches.slice(0, 5).map((m, i) => ({
    rank: i + 1,
    nodeId: m.id,
    kind: m.kind,
    label: m.label,
    reason:
      m.kind === "interchange"
        ? "Cross-system wire — check contract health and both endpoints"
        : m.kind === "doc" || m.kind === "adr"
          ? "Documentation hit — read body via brain_doc_get"
          : "Architecture match — expand with brain_neighborhood",
    docs_ref:
      graph.nodes.find((n) => n.id === m.id)?.docs_ref ??
      (m.path?.startsWith("docs/") ? m.path : null),
  }));

  const freshness = brainFreshness(graph, {
    isGenerated: opts?.isGenerated,
  });

  const guidance = [
    "Call brain_neighborhood on the primary architecture id before editing code.",
    "Call brain_doc_get for any docs_ref or doc/adr hit.",
    "Cite brain node ids and doc paths in the write-up.",
    "If search is empty, verify synonyms manually — do not invent surfaces.",
    freshness.stale
      ? "Graph may be stale — run pnpm brain:build or check brain:check."
      : "Graph freshness within threshold.",
  ];

  // Emphasize systems with recent commits if we only have SHAs (P3 light)
  if (freshness.ageHours != null && freshness.ageHours < 48) {
    guidance.push("Graph regenerated within 48h — trust topology for this incident window.");
  }

  return {
    query: q,
    graphGeneratedAt: graph.generatedAt ?? "",
    freshness,
    search: effectiveSearch,
    primaryId: primary?.id ?? null,
    neighborhood: neigh,
    failureModes: fms,
    hypotheses,
    guidance,
  };
}
