/**
 * THE BRAIN — detail-panel helpers (pure, no React).
 *
 * Resolves the active selection (a node id OR an edge id, per the spine
 * contract `view.selection: string | null`) to a discriminated shape the
 * detail-panel router can switch on, plus small presentational helpers used by
 * the sub-renderers (repo links, surface-kind detection, contract code).
 */

import type {
  BrainEdge,
  BrainGraph,
  BrainNode,
  Health,
  NodeState,
  System,
} from "@/lib/brain/types";
import {
  HEALTH_GLYPH,
  HEALTH_LABEL,
  STATE_GLYPH,
  STATE_LABEL,
  SYSTEM_ACCENT,
  SYSTEM_LABEL,
} from "@/lib/brain/types";
import { isClusterNode, nodeById } from "@/lib/brain/selectors";

/* ── Selection resolution ──────────────────────────────────────────────────
 * view.selection is a single id. It is a node id at L1/L2/L3 (and clusters), or
 * an interchange edge id (ix1…) for a station. This resolves it. */

export type Resolved =
  | { kind: "node"; node: BrainNode }
  | { kind: "edge"; edge: BrainEdge }
  | { kind: "none" };

export function resolveSelection(
  graph: BrainGraph,
  selection: string | null,
): Resolved {
  if (!selection) return { kind: "none" };
  const node = nodeById(graph, selection);
  if (node) return { kind: "node", node };
  const edge = graph.edges.find((e) => e.id === selection);
  if (edge) return { kind: "edge", edge };
  return { kind: "none" };
}

/* ── System / health / state presentation ────────────────────────────────── */

export function systemAccent(system: System | null): string {
  return system ? SYSTEM_ACCENT[system] : "var(--ext)";
}

export function systemLabel(system: System | null): string {
  return system ? SYSTEM_LABEL[system] : "External";
}

export function stateGlyph(state: NodeState): string {
  return STATE_GLYPH[state];
}
export function stateLabel(state: NodeState): string {
  return STATE_LABEL[state];
}

export function healthGlyph(h: Health | undefined): string {
  return h ? HEALTH_GLYPH[h] : HEALTH_GLYPH.warn;
}
export function healthLabel(h: Health | undefined): string {
  return h ? HEALTH_LABEL[h] : HEALTH_LABEL.warn;
}

/* ── Readiness % from a set of nodes (done=1, doing=.5, needed=0) ─────────── */

const STATE_WEIGHT: Record<NodeState, number> = { done: 1, doing: 0.5, needed: 0 };

export function readinessPct(nodes: BrainNode[]): number {
  if (nodes.length === 0) return 0;
  const sum = nodes.reduce((s, n) => s + STATE_WEIGHT[n.state], 0);
  return Math.round((sum / nodes.length) * 100);
}

/* ── Surface-kind detection (FR-DETAIL-6) ──────────────────────────────────
 * A "route" surface starts with an HTTP method (GET/POST/…); everything else
 * is a "file" surface (a path / module reference). */

const METHOD_RE = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/i;

export interface SurfaceShape {
  isFile: boolean;
  method?: string;
  path: string;
  /** Language/contract badge for file surfaces (FR-DETAIL-6). */
  langBadge?: string;
}

export function shapeSurface(raw: string): SurfaceShape {
  const trimmed = raw.trim();
  const m = trimmed.match(METHOD_RE);
  if (m) {
    return {
      isFile: false,
      method: m[1].toUpperCase(),
      path: trimmed.slice(m[1].length).trim(),
    };
  }
  return { isFile: true, path: trimmed, langBadge: langBadgeFor(trimmed) };
}

function langBadgeFor(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "TS";
  if (lower.endsWith(".py")) return "PY";
  if (lower.endsWith(".sql")) return "SQL";
  if (lower.endsWith(".md") || lower.endsWith(".mdx")) return "MD";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "YAML";
  if (lower.endsWith(".json")) return "JSON";
  if (lower.includes("(sse)")) return "SSE";
  if (lower.includes("(planned)")) return "PLAN";
  if (lower.startsWith("/app") || lower.startsWith("/api") || lower.startsWith("/lib"))
    return "ROUTE";
  return "FILE";
}

/* ── Repo URL resolution (FR-DETAIL-7 "Open in repo") ───────────────────────
 * Maps a system to its GitHub repo root and best-effort builds a deep link.
 * These are the source repos named in 00-BUILD-PLAN.md §"Key absolute paths".
 * Resolution is best-effort: where the path is unknown we link the repo root. */

const REPO_BASE: Record<System, string | null> = {
  vav: "https://github.com/tomasgutierrez2000-eng/VZ_Tourism_Project",
  caney: "https://github.com/tomasgutierrez2000-eng/tour-pms-main",
  crm: "https://github.com/tomasgutierrez2000-eng/AGB-CRM",
  restaurants: "https://github.com/tomasgutierrez2000-eng/caneycloud-restaurant",
  academy: null, // no repo yet — planned/fog-of-war
};

/** Best-effort "open in repo" URL for a node's surface/file path. */
export function repoUrlFor(
  system: System | null,
  pathish: string | null,
): string | null {
  if (!system) return null;
  const base = REPO_BASE[system];
  if (!base) return null;
  if (!pathish) return base;
  const p = pathish.trim();
  // Route surfaces ("POST /api/…") and pseudo-paths aren't real files — link root.
  if (METHOD_RE.test(p)) return base;
  if (p.includes("(planned)") || p.includes("(SSE)")) return base;
  const clean = p.replace(/^\//, "");
  return `${base}/blob/main/${clean}`;
}

/** Resolve a contract_ref (often a repo-prefixed path) to a URL (FR-DETAIL-7). */
export function contractUrlFor(contractRef: string | null | undefined): string | null {
  if (!contractRef) return null;
  const ref = contractRef.trim();
  const prefixMap: Array<[string, System]> = [
    ["VZ_Tourism_Project/", "vav"],
    ["tour-pms-main/", "caney"],
    ["AGB-CRM/", "crm"],
    ["caneycloud-restaurant/", "restaurants"],
  ];
  for (const [prefix, sys] of prefixMap) {
    if (ref.startsWith(prefix)) {
      const base = REPO_BASE[sys];
      if (!base) return null;
      const rest = ref.slice(prefix.length).split("#")[0];
      // Paths with "…" are abbreviated — link the repo root instead.
      if (rest.includes("...")) return base;
      return `${base}/blob/main/${rest}`;
    }
  }
  return null;
}

/* ── Re-exports the sub-renderers lean on ──────────────────────────────────── */
export { isClusterNode, SYSTEM_ACCENT, SYSTEM_LABEL };
