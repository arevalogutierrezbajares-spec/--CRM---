/**
 * THE BRAIN — pure graph selectors.
 *
 * All functions here are PURE (no I/O, no mutation, no refetch — NFR-PERF-2):
 * given the immutable BrainGraph + a view descriptor, they derive the subset of
 * nodes/edges that should be visible at the current altitude/axis/focus, apply
 * the per-level cap (NFR-SCALE-2), and synthesize roadmap cluster pseudo-nodes
 * (FR-NAV-7). Used by the lens reducers and the provider.
 */

import type {
  BrainEdge,
  BrainGraph,
  BrainNode,
  Fn,
  NodeLevel,
  NodeState,
  System,
} from "./types";

export type Axis = "system" | "function";

/** Maximum nodes shown per altitude before clustering kicks in (NFR-SCALE-2). */
export const NODE_CAP = 30;

/** Minimum number of `needed` siblings that collapse into a cluster (FR-NAV-7). */
export const CLUSTER_THRESHOLD = 2;

export interface VisibleQuery {
  level: NodeLevel;
  /** System being drilled into (L1+); null at portfolio (L0). */
  focusSystemId?: System | null;
  /** Function being drilled into when axis === "function". */
  focusFn?: Fn | null;
  axis: Axis;
  /** Domain node id being drilled into at L2. */
  focusDomainId?: string | null;
  /** Expanded roadmap-cluster parent ids (so the user can pop a cluster open). */
  expandedClusters?: string[];
}

export interface BreadcrumbItem {
  /** Stable id usable as a nav target (node id, "portfolio", "functions"). */
  id: string;
  label: string;
  level: NodeLevel;
}

/** A synthesized roadmap-cluster pseudo-node (FR-NAV-7). Not in the artifact. */
export interface ClusterNode extends BrainNode {
  /** Marks this as a synthetic cluster — renderer draws the hatched variant. */
  isCluster: true;
  /** Real node ids collapsed inside this cluster. */
  clusterMembers: string[];
}

/** Type guard for cluster pseudo-nodes. */
export function isClusterNode(n: BrainNode): n is ClusterNode {
  return (n as ClusterNode).isCluster === true;
}

/** Direct children of a node id (by parentId). Pure, order = artifact order. */
export function childrenOf(graph: BrainGraph, parentId: string | null): BrainNode[] {
  return graph.nodes.filter((n) => n.parentId === parentId);
}

/** All nodes belonging to a system at a given level. */
export function nodesOfSystem(
  graph: BrainGraph,
  system: System,
  level: NodeLevel,
): BrainNode[] {
  return graph.nodes.filter((n) => n.system === system && n.level === level);
}

/** All domain (L2) nodes assigned to a function. */
export function domainsOfFn(graph: BrainGraph, fn: Fn): BrainNode[] {
  return graph.nodes.filter((n) => n.level === 2 && n.fn === fn);
}

/**
 * Synthesize the function hub pseudo-nodes for the By-Function axis root
 * (FR-AXIS-1/2/3). Functions live in `graph.functions`, not as BrainNodes, so
 * we build hub-shaped nodes on a deterministic radial and carry the readiness
 * `pct` (consumed by HubNode's ring). State is double-encoded from pct so the
 * capability map survives grayscale (done ≥80, doing >0, else needed).
 */
export function functionNodes(graph: BrainGraph): BrainNode[] {
  const fns = graph.functions ?? [];
  const n = fns.length || 1;
  const cx = 560;
  const cy = 460;
  const R = 460;
  return fns.map((f, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const pct = Math.max(0, Math.min(100, Math.round(f.pct)));
    const state: NodeState = pct >= 80 ? "done" : pct > 0 ? "doing" : "needed";
    const node = {
      id: `fn.${f.id}`,
      level: 0 as NodeLevel,
      kind: "system" as const, // renders through the HubNode component
      parentId: null,
      label: f.name,
      system: null,
      source: "openapi" as const,
      hosted_by: null,
      fn: f.id,
      state,
      liveness: null,
      size: "lg" as const,
      owner: null,
      branch: null,
      last_commit: null,
      docs_ref: null,
      surfaces: [],
      meta: `${f.members.length} capabilit${f.members.length === 1 ? "y" : "ies"} · ${pct}% built`,
      summary: null,
      pos: { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) },
      // Non-schema hint read by HubNode.hubPercent — rides along on node.data.
      pct,
    };
    return node as BrainNode;
  });
}

/**
 * Re-position a set of nodes on a centered grid. Used for By-Function L1, where
 * member domains come from different systems and would otherwise scatter at
 * their system-pinned coordinates.
 */
function layoutGrid(nodes: BrainNode[]): BrainNode[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  const gx = 300;
  const gy = 150;
  const x0 = 160;
  const y0 = 160;
  return nodes.map((node, i) => ({
    ...node,
    pos: { x: x0 + (i % cols) * gx, y: y0 + Math.floor(i / cols) * gy },
  }));
}

/**
 * Collapse runs of `needed` sibling domains into a single roadmap cluster
 * pseudo-node (FR-NAV-7) UNLESS the cluster is explicitly expanded. Returns the
 * built/wip nodes verbatim followed by, when applicable, one cluster node that
 * stands in for all `needed` siblings.
 *
 * `parentId` keys the synthetic cluster id so it is stable across renders.
 */
export function clusterNeeded(
  siblings: BrainNode[],
  parentId: string,
  expanded = false,
): BrainNode[] {
  if (expanded) return siblings;
  const needed = siblings.filter((n) => n.state === "needed");
  if (needed.length < CLUSTER_THRESHOLD) return siblings;

  const kept = siblings.filter((n) => n.state !== "needed");
  const first = needed[0];
  const cluster: ClusterNode = {
    id: `${parentId}.__roadmap`,
    level: first.level,
    kind: "domain",
    parentId: first.parentId,
    label: `Roadmap · ${needed.length} needed`,
    system: first.system,
    source: first.source,
    hosted_by: first.hosted_by,
    fn: null,
    state: "needed",
    liveness: null,
    size: "md",
    owner: null,
    branch: null,
    last_commit: null,
    docs_ref: null,
    surfaces: [],
    meta: null,
    summary: null,
    pos: first.pos,
    isCluster: true,
    clusterMembers: needed.map((n) => n.id),
  };
  return [...kept, cluster];
}

/** Cap a node list to NODE_CAP, preserving order (NFR-SCALE-2). */
export function capNodes<T>(nodes: T[], cap = NODE_CAP): T[] {
  return nodes.length <= cap ? nodes : nodes.slice(0, cap);
}

/**
 * The set of nodes visible at the current view. PURE.
 *
 * - L0 system axis  → the system (L1) hub nodes (portfolio overview).
 * - L0 function axis → the function pseudo-set is handled by the renderer from
 *   graph.functions; here we return [] (functions aren't BrainNodes).
 * - L1 system axis  → the focused system's domains (clustered + capped).
 * - L1 function axis→ the focused function's member domains.
 * - L2             → the focused domain's surfaces.
 */
export function visibleNodes(graph: BrainGraph, q: VisibleQuery): BrainNode[] {
  const expanded = new Set(q.expandedClusters ?? []);

  if (q.level === 0) {
    // Portfolio (system axis) → the system hubs; capability map (function axis)
    // → the synthesized function hubs.
    if (q.axis === "function") return capNodes(functionNodes(graph));
    return capNodes(graph.nodes.filter((n) => n.level === 1));
  }

  if (q.level === 1) {
    if (q.axis === "function") {
      // No focused function → fall back to the function root (defensive).
      if (!q.focusFn) return capNodes(functionNodes(graph));
      const members = domainsOfFn(graph, q.focusFn);
      return capNodes(layoutGrid(members));
    }
    if (!q.focusSystemId) return [];
    const systemHubId = `${q.focusSystemId}`;
    const domains = childrenOf(graph, systemHubId).filter((n) => n.level === 2);
    const clustered = clusterNeeded(
      domains,
      systemHubId,
      expanded.has(`${systemHubId}.__roadmap`),
    );
    return capNodes(clustered);
  }

  // L2 (and L3 fallthrough): surfaces under the focused domain.
  if (q.focusDomainId) {
    return capNodes(childrenOf(graph, q.focusDomainId).filter((n) => n.level === 3));
  }
  return [];
}

/**
 * Edges visible at the current view. PURE. At L0 we surface interchange edges
 * (the cross-system stations); at L1/L2 we surface the contains/calls edges
 * touching the visible node set.
 */
export function visibleEdges(graph: BrainGraph, q: VisibleQuery): BrainEdge[] {
  // The By-Function axis is a capability grouping, not a wiring diagram — no
  // structural/interchange edges render there in v0 (avoids dangling endpoints
  // since function views don't contain the system/domain nodes the edges name).
  if (q.axis === "function") return [];

  if (q.level === 0) {
    // Only LIVE interchanges render as stations in v0 (planned excluded).
    return graph.edges.filter(
      (e) => e.kind === "interchange" && e.contract_status === "live",
    );
  }
  const visibleIds = new Set(visibleNodes(graph, q).map((n) => n.id));
  return graph.edges.filter((e) => {
    // Edge endpoints are {system,domain}; match against visible domain labels.
    return (
      visibleIds.size > 0 &&
      (e.kind === "interchange" || e.kind === "contains" || e.kind === "calls")
    );
  });
}

/**
 * Build the breadcrumb trail for a path (FR-NAV-3). The path is the ordered
 * chain of node ids from root → current focus. Returns labeled crumbs with the
 * synthetic root prepended ("Portfolio" / "Functions").
 */
export function breadcrumbFor(
  graph: BrainGraph,
  path: string[],
  axis: Axis,
): BreadcrumbItem[] {
  const root: BreadcrumbItem =
    axis === "function"
      ? { id: "functions", label: "Functions", level: 0 }
      : { id: "portfolio", label: "Portfolio", level: 0 };

  const crumbs: BreadcrumbItem[] = [root];
  for (const id of path) {
    // Function pseudo-nodes ("fn.<id>") aren't BrainNodes — resolve their label
    // from graph.functions so the By-Function trail reads correctly.
    if (axis === "function" && id.startsWith("fn.")) {
      const f = graph.functions.find((fn) => `fn.${fn.id}` === id);
      if (f) {
        crumbs.push({ id, label: f.name, level: 1 });
        continue;
      }
    }
    const node = graph.nodes.find((n) => n.id === id);
    if (node) {
      crumbs.push({ id: node.id, label: node.label, level: node.level });
    }
  }
  return crumbs;
}

/**
 * The 3 up-paths to an ancestor from a node (FR-NAV-2): parent chain to root.
 * Returns ancestor ids ordered nearest→farthest (parent, grandparent, …).
 * Used by the back-button + breadcrumb + Esc handler.
 */
export function upPaths(graph: BrainGraph, nodeId: string): string[] {
  const out: string[] = [];
  let current = graph.nodes.find((n) => n.id === nodeId);
  let guard = 0;
  while (current && current.parentId && guard < 16) {
    out.push(current.parentId);
    const parentId: string = current.parentId;
    current = graph.nodes.find((n) => n.id === parentId);
    guard += 1;
  }
  return out;
}

/** Resolve a node by id (convenience; pure). */
export function nodeById(graph: BrainGraph, id: string): BrainNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}
