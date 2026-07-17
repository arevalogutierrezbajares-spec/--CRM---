/**
 * THE BRAIN — deterministic rebuild-guard search index.
 *
 * Pure string ranking over brain-graph.json. No embeddings, no LLM.
 * Empty match set ⇒ safeToBuild (pain P2).
 */

import type { BrainGraph, BrainNode } from "./types";

export type BrainSearchHit = {
  id: string;
  kind: "system" | "domain" | "surface" | "entity" | "interchange";
  label: string;
  system: string | null;
  path: string;
  score: number;
};

export type BrainSearchResult = {
  query: string;
  matches: BrainSearchHit[];
  /** True when nothing matched — agent may treat as "safe to build". */
  safeToBuild: boolean;
};

/** Example queries for the search-first command center. */
export const BRAIN_SEARCH_EXAMPLES = [
  { q: "booking webhook", hint: "Cross-system wire" },
  { q: "posada intake", hint: "CRM → Caney onboarding" },
  { q: "/api/holds", hint: "VAV booking surface" },
  { q: "partner room", hint: "CRM domain" },
  { q: "ix1", hint: "Interchange station" },
] as const;

const RECENT_KEY = "brain.recentSearches.v1";
const RECENT_MAX = 6;

/** Read recent search strings (browser only). */
export function loadRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

/** Persist a successful query to recent list (browser only). */
export function pushRecentSearch(query: string): void {
  if (typeof window === "undefined") return;
  const q = query.trim();
  if (!q || q.length < 2) return;
  try {
    const prev = loadRecentSearches().filter((x) => x.toLowerCase() !== q.toLowerCase());
    localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...prev].slice(0, RECENT_MAX)));
  } catch {
    /* ignore quota */
  }
}

/** Empty-state copy for rebuild-guard — soft caution, not a green light. */
export function safeToBuildMessage(query: string): string {
  return `No indexed match for "${query.trim()}" — verify before building (typos and synonyms may not appear).`;
}

type IndexEntry = {
  id: string;
  kind: BrainSearchHit["kind"];
  label: string;
  system: string | null;
  path: string;
  haystack: string;
};

function nodePath(n: BrainNode): string {
  const bits = [n.system, n.label, n.id].filter(Boolean);
  return bits.join(" › ");
}

/** Build a flat searchable index once per graph load. */
export function buildSearchIndex(graph: BrainGraph): IndexEntry[] {
  const entries: IndexEntry[] = [];

  for (const n of graph.nodes) {
    if (n.level === 0) continue; // portfolio root
    const kind =
      n.kind === "system"
        ? "system"
        : n.kind === "domain"
          ? "domain"
          : n.kind === "entity"
            ? "entity"
            : "surface";
    const label = n.label;
    const path = nodePath(n);
    const haystack = [n.id, n.label, n.system ?? "", n.docs_ref ?? "", ...(n.surfaces ?? [])]
      .join(" ")
      .toLowerCase();
    entries.push({
      id: n.id,
      kind,
      label,
      system: n.system,
      path,
      haystack,
    });
  }

  for (const e of graph.edges) {
    if (e.kind !== "interchange") continue;
    const label = e.purpose ?? e.id;
    const path = `${e.from.system}/${e.from.domain} → ${e.to.system}/${e.to.domain}`;
    const haystack = [
      e.id,
      e.purpose ?? "",
      e.route ?? "",
      e.contract_ref ?? "",
      e.from.system,
      e.from.domain,
      e.to.system,
      e.to.domain,
      ...(e.breaks ?? []),
    ]
      .join(" ")
      .toLowerCase();
    entries.push({
      id: e.id,
      kind: "interchange",
      label,
      system: e.from.system,
      path,
      haystack,
    });
  }

  return entries;
}

const KIND_BOOST: Record<BrainSearchHit["kind"], number> = {
  system: 40,
  domain: 30,
  interchange: 25,
  surface: 20,
  entity: 15,
};

/**
 * Rank matches for query `q`. Deterministic for a given graph + query.
 */
export function searchBrain(
  graph: BrainGraph,
  q: string,
  limit = 20,
  index?: IndexEntry[],
): BrainSearchResult {
  const query = q.trim();
  if (!query) {
    return { query: q, matches: [], safeToBuild: false };
  }

  const needle = query.toLowerCase();
  const idx = index ?? buildSearchIndex(graph);
  const hits: BrainSearchHit[] = [];

  for (const e of idx) {
    let score = 0;
    const labelL = e.label.toLowerCase();
    const idL = e.id.toLowerCase();

    if (idL === needle || labelL === needle) score += 100;
    else if (idL.startsWith(needle) || labelL.startsWith(needle)) score += 70;
    else if (idL.includes(needle) || labelL.includes(needle)) score += 50;
    else if (e.haystack.includes(needle)) score += 25;
    else continue;

    // Token AND: every whitespace token must appear somewhere
    const tokens = needle.split(/\s+/).filter(Boolean);
    if (tokens.length > 1) {
      const all = tokens.every((t) => e.haystack.includes(t));
      if (!all) continue;
      score += 10 * tokens.length;
    }

    score += KIND_BOOST[e.kind] ?? 0;
    hits.push({
      id: e.id,
      kind: e.kind,
      label: e.label,
      system: e.system,
      path: e.path,
      score,
    });
  }

  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const matches = hits.slice(0, limit);
  return {
    query,
    matches,
    safeToBuild: matches.length === 0,
  };
}
