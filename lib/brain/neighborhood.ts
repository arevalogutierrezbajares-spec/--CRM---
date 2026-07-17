/**
 * Expand a graph node or interchange edge into a bounded neighborhood pack.
 * Pure, deterministic, no I/O. Used by agent tools for RCA blast-radius.
 */

import type { BrainEdge, BrainGraph, BrainNode } from "./types";

export type NeighborhoodResult =
  | {
      ok: true;
      focus: { type: "node"; node: BrainNode } | { type: "edge"; edge: BrainEdge };
      depth: number;
      nodes: BrainNode[];
      edges: BrainEdge[];
      linkedDocs: BrainNode[];
      graphGeneratedAt: string;
      truncated: boolean;
    }
  | { ok: false; error: string; graphGeneratedAt?: string };

const DEFAULT_NODE_CAP = 40;
const DEFAULT_EDGE_CAP = 60;

function nodeById(graph: BrainGraph, id: string): BrainNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

function edgeById(graph: BrainGraph, id: string): BrainEdge | undefined {
  return graph.edges.find((e) => e.id === id);
}

/** Domains on edges hold full node ids for structural edges. */
function endpointIds(e: BrainEdge): string[] {
  const ids = [e.from.domain, e.to.domain];
  if (e.kind === "interchange") {
    // also allow system hubs
    ids.push(e.from.system, e.to.system);
  }
  return ids;
}

/**
 * @param id Node id or interchange edge id
 * @param depth 1 or 2 (clamped)
 */
export function neighborhood(
  graph: BrainGraph,
  id: string,
  depth = 1,
  opts?: { maxNodes?: number; maxEdges?: number },
): NeighborhoodResult {
  const graphGeneratedAt = graph.generatedAt ?? "";
  const q = (id ?? "").trim();
  if (!q) {
    return { ok: false, error: "id is required", graphGeneratedAt };
  }

  const d = Math.min(2, Math.max(1, Math.floor(depth) || 1));
  const maxNodes = opts?.maxNodes ?? DEFAULT_NODE_CAP;
  const maxEdges = opts?.maxEdges ?? DEFAULT_EDGE_CAP;

  const focusNode = nodeById(graph, q);
  const focusEdge = !focusNode ? edgeById(graph, q) : undefined;

  if (!focusNode && !focusEdge) {
    return {
      ok: false,
      error: `Unknown node or edge id: ${q}`,
      graphGeneratedAt,
    };
  }

  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  if (focusNode) {
    nodeIds.add(focusNode.id);
  }
  if (focusEdge) {
    edgeIds.add(focusEdge.id);
    for (const eid of endpointIds(focusEdge)) nodeIds.add(eid);
  }

  // Seed frontier
  let frontier = new Set(nodeIds);

  for (let step = 0; step < d; step++) {
    const next = new Set<string>();
    for (const e of graph.edges) {
      const ends = endpointIds(e);
      const touches = ends.some((x) => frontier.has(x) || nodeIds.has(x));
      if (!touches) continue;
      edgeIds.add(e.id);
      for (const x of ends) {
        if (!nodeIds.has(x)) next.add(x);
        nodeIds.add(x);
      }
    }
    // Parent/child via parentId
    for (const n of graph.nodes) {
      if (frontier.has(n.id) && n.parentId) {
        nodeIds.add(n.parentId);
        next.add(n.parentId);
      }
      if (n.parentId && frontier.has(n.parentId)) {
        if (n.kind !== "doc" && n.kind !== "adr") {
          nodeIds.add(n.id);
          next.add(n.id);
        }
      }
    }
    frontier = next;
  }

  // Linked documentation via documents edges
  const linkedDocIds = new Set<string>();
  for (const e of graph.edges) {
    if (e.kind !== "documents") continue;
    const from = e.from.domain;
    const to = e.to.domain;
    if (nodeIds.has(to) || (focusNode && to === focusNode.id)) {
      linkedDocIds.add(from);
      nodeIds.add(from);
      edgeIds.add(e.id);
    }
    if (focusNode && from === focusNode.id) {
      linkedDocIds.add(from);
      nodeIds.add(to);
      edgeIds.add(e.id);
    }
  }

  let truncated = false;
  let nodes = graph.nodes.filter((n) => nodeIds.has(n.id));
  let edges = graph.edges.filter((e) => edgeIds.has(e.id));

  if (nodes.length > maxNodes) {
    truncated = true;
    // Prefer focus, non-docs, then docs
    const focusId = focusNode?.id;
    nodes = [
      ...nodes.filter((n) => n.id === focusId),
      ...nodes.filter((n) => n.id !== focusId && n.kind !== "doc" && n.kind !== "adr"),
      ...nodes.filter((n) => n.kind === "doc" || n.kind === "adr"),
    ].slice(0, maxNodes);
    const keep = new Set(nodes.map((n) => n.id));
    edges = edges.filter((e) => {
      const ends = endpointIds(e);
      return ends.every((x) => keep.has(x) || e.kind === "interchange");
    });
  }
  if (edges.length > maxEdges) {
    truncated = true;
    edges = edges.slice(0, maxEdges);
  }

  const linkedDocs = graph.nodes.filter(
    (n) => linkedDocIds.has(n.id) && (n.kind === "doc" || n.kind === "adr"),
  );

  return {
    ok: true,
    focus: focusNode
      ? { type: "node", node: focusNode }
      : { type: "edge", edge: focusEdge! },
    depth: d,
    nodes,
    edges,
    linkedDocs,
    graphGeneratedAt,
    truncated,
  };
}
