/**
 * THE BRAIN — graphology analytics overlay (Concern 3: gap-finding).
 *
 * Pure, DETERMINISTIC analytics over a BrainGraph's SEMANTIC subgraph
 * (interchange + reads_writes + calls — never the structural `contains`
 * hierarchy). It surfaces what a pretty map alone cannot:
 *
 *   • crossSystemCycles — bidirectional dependency loops between systems
 *     (e.g. CaneyCloud ⇄ AGB-CRM), the architectural smell most worth knowing.
 *   • hubs               — highest-degree nodes in the dependency graph
 *     (god-objects / integration choke-points).
 *   • coverageGaps       — domains with ZERO mapped data-flow: the blind spots
 *     where the extractor has surfaced no edges yet.
 *   • communities        — Louvain clusters; a cluster spanning >1 system is a
 *     coupling hotspot.
 *
 * Powered by graphology (+ communities-louvain, components). Every traversal is
 * sorted and Louvain is seeded with a fixed PRNG, so the same BrainGraph yields
 * byte-identical insights on every run (determinism parity with the layout
 * engine, NFR-LAYOUT-1/2). No time, no DOM, no Math.random — safe to compute at
 * build time OR on the client.
 */

import GraphDefault from "graphology";

// graphology's bundled d.ts resolves the default export to the abstract
// zero-arg Graph from graphology-types under this tsconfig, which drops the
// options constructor and every mutation method — the ONLY file that
// constructs graphs directly, and the error that broke the Vercel build once
// the type-check cache went cold. Runtime shape is correct; re-type locally.
type AnyGraph = {
  mergeNode: (n: string) => void;
  mergeEdge: (a: string, b: string) => void;
  nodes: () => string[];
  forEachNode: (cb: (n: string) => void) => void;
  inDegree: (n: string) => number;
  outDegree: (n: string) => number;
  degree: (n: string) => number;
  order: number;
  size: number;
};
const Graph = GraphDefault as unknown as new (opts?: {
  type?: string; multi?: boolean; allowSelfLoops?: boolean;
}) => AnyGraph & Record<string, any>;
import { stronglyConnectedComponents } from "graphology-components";
import louvain from "graphology-communities-louvain";
import type { BrainGraph, BrainNode, EdgeKind, System } from "../types";
import { SYSTEM_LABEL } from "../types";

/** Edges that express real dependency / data-flow — NOT the `contains` tree. */
export const SEMANTIC_EDGE_KINDS: readonly EdgeKind[] = [
  "interchange",
  "reads_writes",
  "calls",
];
const SEMANTIC = new Set<EdgeKind>(SEMANTIC_EDGE_KINDS);
const VALID_SYSTEMS = new Set<string>(Object.keys(SYSTEM_LABEL));

export interface NodeRef {
  id: string;
  label: string;
  system: System | null;
}

export interface HubInsight extends NodeRef {
  /** Total semantic-edge degree (in + out). */
  degree: number;
  inDegree: number;
  outDegree: number;
}

export interface CycleVia {
  from: NodeRef;
  to: NodeRef;
  route: string | null;
  purpose: string | null;
}

export interface CycleInsight {
  /** The systems forming the dependency loop, sorted. */
  systems: System[];
  /** Human label, e.g. "CaneyCloud ⇄ AGB-CRM". */
  label: string;
  /** The interchange edges that close the loop. */
  via: CycleVia[];
}

export interface GapInsight extends NodeRef {
  /** Why it's flagged. */
  reason: string;
  /** Child surfaces/entities under this domain (size of the blind spot). */
  childCount: number;
}

export interface CommunityInsight {
  /** Stable index (re-numbered by size then smallest member). */
  index: number;
  size: number;
  systems: System[];
  members: NodeRef[];
  /** True when the cluster spans more than one system. */
  crossSystem: boolean;
}

export interface BrainInsights {
  semanticEdgeCount: number;
  hubs: HubInsight[];
  crossSystemCycles: CycleInsight[];
  coverageGaps: GapInsight[];
  communities: CommunityInsight[];
  coverage: { domains: number; mapped: number; pct: number };
}

/** A system id parsed from a dotted node id ("vav.booking" → "vav"), or null. */
function systemFromId(id: string): System | null {
  const head = id.split(".")[0];
  return VALID_SYSTEMS.has(head) ? (head as System) : null;
}

/** Deterministic mulberry32 PRNG so Louvain never wobbles between runs. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Compute the analytics overlay for a BrainGraph. Pure + deterministic. */
export function computeInsights(graph: BrainGraph): BrainInsights {
  const byId = new Map<string, BrainNode>();
  for (const n of graph.nodes) byId.set(n.id, n);

  const refOf = (id: string): NodeRef => {
    const n = byId.get(id);
    return { id, label: n?.label ?? id, system: n?.system ?? systemFromId(id) };
  };

  const semanticEdges = graph.edges.filter((e) => SEMANTIC.has(e.kind));
  // Deterministic insertion order for every downstream graph build.
  const sorted = [...semanticEdges].sort((a, b) => a.id.localeCompare(b.id));

  // ── Hubs: degree on the directed semantic node graph ───────────────────
  const dg = new Graph({ type: "directed", multi: false, allowSelfLoops: true });
  for (const e of sorted) {
    dg.mergeNode(e.from.domain);
    dg.mergeNode(e.to.domain);
    if (e.from.domain !== e.to.domain) dg.mergeEdge(e.from.domain, e.to.domain);
  }
  const hubs: HubInsight[] = dg
    .nodes()
    .map((id) => ({
      ...refOf(id),
      degree: dg.degree(id),
      inDegree: dg.inDegree(id),
      outDegree: dg.outDegree(id),
    }))
    .filter((h) => h.degree >= 2)
    .sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id));

  // ── Cross-system cycles: SCCs of the system-collapsed interchange graph ─
  const crossEdges = graph.edges.filter(
    (e) =>
      e.kind === "interchange" &&
      e.from.system &&
      e.to.system &&
      e.from.system !== e.to.system,
  );
  const sg = new Graph({ type: "directed", multi: false, allowSelfLoops: false });
  for (const e of crossEdges) {
    sg.mergeNode(e.from.system);
    sg.mergeNode(e.to.system);
    sg.mergeEdge(e.from.system, e.to.system);
  }
  const sccs = sg.order > 0 ? stronglyConnectedComponents(sg) : [];
  const crossSystemCycles: CycleInsight[] = sccs
    .filter((comp) => comp.length >= 2)
    .map((comp) => {
      const set = new Set(comp);
      const systems = [...comp].sort() as System[];
      const via: CycleVia[] = crossEdges
        .filter(
          (e) =>
            set.has(e.from.system as string) && set.has(e.to.system as string),
        )
        .map((e) => ({
          from: refOf(e.from.domain),
          to: refOf(e.to.domain),
          route: e.route ?? null,
          purpose: e.purpose ?? null,
        }))
        .sort(
          (a, b) =>
            a.from.id.localeCompare(b.from.id) || a.to.id.localeCompare(b.to.id),
        );
      return {
        systems,
        label: systems.map((s) => SYSTEM_LABEL[s]).join(" ⇄ "),
        via,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  // ── Coverage gaps: level-2 domains touched by no semantic edge ──────────
  const ownerDomainOf = (id: string): string | null => {
    const n = byId.get(id);
    if (!n) return null;
    if (n.level === 2) return n.id;
    if (n.level === 3) return n.parentId; // parent of a surface/entity is its domain
    return null;
  };
  const mapped = new Set<string>();
  for (const e of semanticEdges) {
    const a = ownerDomainOf(e.from.domain);
    const b = ownerDomainOf(e.to.domain);
    if (a) mapped.add(a);
    if (b) mapped.add(b);
  }
  const domains = graph.nodes.filter(
    (n) => n.level === 2 && n.kind === "domain",
  );
  const childCountOf = (domainId: string): number =>
    graph.nodes.reduce((acc, n) => (n.parentId === domainId ? acc + 1 : acc), 0);
  const coverageGaps: GapInsight[] = domains
    .filter((d) => !mapped.has(d.id))
    .map((d) => ({
      ...refOf(d.id),
      reason: "No data-flow edges extracted (interchange / reads_writes / calls)",
      childCount: childCountOf(d.id),
    }))
    .sort((a, b) => b.childCount - a.childCount || a.id.localeCompare(b.id));
  const mappedCount = domains.filter((d) => mapped.has(d.id)).length;
  const coverage = {
    domains: domains.length,
    mapped: mappedCount,
    pct: domains.length ? Math.round((mappedCount / domains.length) * 100) : 0,
  };

  // ── Communities: Louvain on the undirected semantic graph (seeded) ──────
  const ug = new Graph({ type: "undirected", multi: false, allowSelfLoops: false });
  for (const e of sorted) {
    if (e.from.domain === e.to.domain) continue;
    ug.mergeNode(e.from.domain);
    ug.mergeNode(e.to.domain);
    ug.mergeEdge(e.from.domain, e.to.domain);
  }
  let communities: CommunityInsight[] = [];
  if (ug.size > 0) {
    const assignment = louvain(ug, { rng: makeRng(0x9e3779b1) }) as Record<
      string,
      number
    >;
    const groups = new Map<number, string[]>();
    for (const id of Object.keys(assignment).sort()) {
      const c = assignment[id];
      const arr = groups.get(c) ?? [];
      arr.push(id);
      groups.set(c, arr);
    }
    communities = [...groups.values()]
      .map((ids) => [...ids].sort())
      .filter((ids) => ids.length >= 2)
      .map((ids) => {
        const members = ids.map(refOf);
        const systems = [
          ...new Set(
            members.map((m) => m.system).filter((s): s is System => !!s),
          ),
        ].sort();
        return {
          index: 0,
          size: ids.length,
          members,
          systems,
          crossSystem: systems.length > 1,
        };
      })
      .sort(
        (a, b) => b.size - a.size || a.members[0].id.localeCompare(b.members[0].id),
      )
      .map((c, i) => ({ ...c, index: i }));
  }

  return {
    semanticEdgeCount: semanticEdges.length,
    hubs,
    crossSystemCycles,
    coverageGaps,
    communities,
    coverage,
  };
}
