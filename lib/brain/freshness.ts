/**
 * Graph freshness snapshot for agent trust decisions.
 */

import type { BrainGraph } from "./types";

export type BrainFreshness = {
  graphGeneratedAt: string;
  ageHours: number | null;
  stale: boolean;
  /** Soft warn threshold days (default 7). */
  staleAfterDays: number;
  commits: {
    vav: string | null;
    caney: string | null;
    crm: string | null;
    restaurants: string | null;
    academy: string | null;
  };
  isGenerated: boolean;
  nodeCount: number;
  edgeCount: number;
  docCount: number;
};

export function brainFreshness(
  graph: BrainGraph,
  opts?: { nowMs?: number; staleAfterDays?: number; isGenerated?: boolean },
): BrainFreshness {
  const staleAfterDays = opts?.staleAfterDays ?? 7;
  const now = opts?.nowMs ?? Date.now();
  const iso = graph.generatedAt ?? "";
  const t = Date.parse(iso);
  const ageHours = Number.isNaN(t) ? null : Math.floor((now - t) / 3_600_000);
  const stale =
    ageHours == null ? true : ageHours > staleAfterDays * 24;

  const c = graph.commit ?? {
    vav: null,
    caney: null,
    crm: null,
    restaurants: null,
    academy: null,
  };

  return {
    graphGeneratedAt: iso,
    ageHours,
    stale,
    staleAfterDays,
    commits: {
      vav: c.vav ?? null,
      caney: c.caney ?? null,
      crm: c.crm ?? null,
      restaurants: c.restaurants ?? null,
      academy: c.academy ?? null,
    },
    isGenerated: opts?.isGenerated ?? true,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    docCount: graph.nodes.filter((n) => n.kind === "doc" || n.kind === "adr")
      .length,
  };
}
