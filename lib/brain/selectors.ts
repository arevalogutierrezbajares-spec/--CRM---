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
import { ringLayout } from "./layout/radial";

export type Axis = "system" | "function";

/** Maximum nodes shown per altitude before clustering kicks in (NFR-SCALE-2).
 *  Lowered for full inventory: dense L3 (caney.auth 30+) stays readable. */
export const NODE_CAP = 22;

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

/** Synthetic cluster kinds: roadmap (needed) or overflow (NODE_CAP rest). */
export type ClusterKind = "roadmap" | "overflow" | "portal";

/** A synthesized cluster / portal pseudo-node. Not in the artifact. */
export interface ClusterNode extends BrainNode {
  /** Marks this as a synthetic cluster — renderer draws the hatched variant. */
  isCluster: true;
  /** Real node ids collapsed inside this cluster (empty for portal). */
  clusterMembers: string[];
  /** roadmap = needed siblings · overflow = cap remainder · portal = other system */
  clusterKind?: ClusterKind;
  /** Portal only: the remote system this interchange points to. */
  portalSystem?: System;
}

/** Type guard for cluster / portal pseudo-nodes. */
export function isClusterNode(n: BrainNode): n is ClusterNode {
  return (n as ClusterNode).isCluster === true;
}

/** Portal chip for L1 focus+context interchange threads. */
export function isPortalNode(n: BrainNode): n is ClusterNode {
  return isClusterNode(n) && n.clusterKind === "portal";
}

/** Direct children of a node id (by parentId). Pure, order = artifact order. */
export function childrenOf(graph: BrainGraph, parentId: string | null): BrainNode[] {
  // Doc/ADR corpus nodes are not architecture children (Phase 1 — search only).
  return graph.nodes.filter(
    (n) =>
      n.parentId === parentId && n.kind !== "doc" && n.kind !== "adr",
  );
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
    clusterKind: "roadmap",
    clusterMembers: needed.map((n) => n.id),
  };
  return [...kept, cluster];
}

/** Cap a node list to NODE_CAP, preserving order (NFR-SCALE-2). */
export function capNodes<T>(nodes: T[], cap = NODE_CAP): T[] {
  return nodes.length <= cap ? nodes : nodes.slice(0, cap);
}

/**
 * Cap siblings with an expandable overflow cluster (instead of silent drop).
 * Priority ids (e.g. endpoints of reads_writes edges) are kept first so
 * micro-wiring stays visible under dense domains.
 */
export function capWithOverflow(
  siblings: BrainNode[],
  parentId: string,
  opts: {
    cap?: number;
    priorityIds?: Set<string>;
    expanded?: boolean;
  } = {},
): BrainNode[] {
  const cap = opts.cap ?? NODE_CAP;
  // Expanded: show up to 2× cap, then re-overflow (never unbounded dump).
  const effectiveCap = opts.expanded ? Math.min(siblings.length, cap * 2) : cap;
  if (siblings.length <= effectiveCap) return siblings;
  // Fall through with effectiveCap as keep budget

  const priority = opts.priorityIds ?? new Set<string>();
  const sorted = [...siblings].sort((a, b) => {
    const ap = priority.has(a.id) ? 0 : 1;
    const bp = priority.has(b.id) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    // Prefer surfaces over entities for scannability when both unprioritized.
    if (a.kind !== b.kind) {
      if (a.kind === "surface") return -1;
      if (b.kind === "surface") return 1;
    }
    return a.id.localeCompare(b.id);
  });

  // Leave one slot for the overflow chip.
  const keep = Math.max(1, effectiveCap - 1);
  const kept = sorted.slice(0, keep);
  const rest = sorted.slice(keep);
  if (rest.length === 0) return kept;

  const first = rest[0];
  const cluster: ClusterNode = {
    id: `${parentId}.__overflow`,
    level: first.level,
    kind: first.kind === "entity" ? "entity" : "surface",
    parentId: first.parentId,
    label: `+${rest.length} more`,
    system: first.system,
    source: first.source,
    hosted_by: first.hosted_by,
    fn: null,
    state: "doing",
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
    clusterKind: "overflow",
    clusterMembers: rest.map((n) => n.id),
  };
  return [...kept, cluster];
}

/** Node ids that participate in reads_writes / calls under a parent domain. */
export function relationalPriorityIds(
  graph: BrainGraph,
  parentId: string,
): Set<string> {
  const childIds = new Set(
    graph.nodes.filter((n) => n.parentId === parentId).map((n) => n.id),
  );
  const priority = new Set<string>();
  for (const e of graph.edges) {
    if (e.kind !== "reads_writes" && e.kind !== "calls") continue;
    if (childIds.has(e.from.domain)) priority.add(e.from.domain);
    if (childIds.has(e.to.domain)) priority.add(e.to.domain);
  }
  return priority;
}

/**
 * Ring radius (abstract units) that keeps adjacent chips ~170u apart along the
 * arc, clamped to [300, 760] so a single child still reads centered and a full
 * 30-child level never explodes. Density-driven (NFR-SCALE-2): more children ⇒
 * a wider ring, so dense BUILT systems (CRM, restaurants) fan out instead of
 * piling into a hairball.
 */
/** Rough rendered width of a chip from its label. The pure layout has no DOM,
 * so this only needs to be close — the measured separation pass in brain-canvas
 * guarantees the final no-overlap; a good estimate just keeps the seed tidy. */
/** Chip width estimate aligned with brain-nodes.css max-width ceilings
 *  (surface chip ≤244, path ≤148; domain chip ≤220, title ≤160). */
function estWidth(node: BrainNode): number {
  const label = node.label ?? "";
  const methodMatch = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)(\/[A-Z]+)?\s+/.exec(
    label,
  );
  if (methodMatch || label.startsWith("/")) {
    // Surface: method badge ~52 + path (CSS max 148) + lang ~36 + pad ~40
    const pathText = methodMatch ? label.slice(methodMatch[0].length) : label;
    const pathW = Math.min(148, Math.max(24, Math.round(pathText.length * 6.8)));
    return Math.max(120, Math.min(244, 52 + pathW + 36 + 40));
  }
  // Domain / hub chip: title capped 160 + glyph + pad
  const title = Math.min(160, Math.round(label.length * 6.8));
  return Math.max(100, Math.min(220, title + 48));
}

/**
 * Seed a focused parent at the origin and its children on CONCENTRIC rings
 * around it: fill the inner ring, then the next, each ring sized to its nodes'
 * widths and clearing the center. On dense levels this is far tidier and more
 * readable than one big sparse ring (more nodes ⇒ another ring, not a thinner
 * spread), and it sits close enough to non-overlapping that the measured pass
 * only polishes — keeping the grouping neat. Deterministic (children arrive
 * sorted by id, NFR-LAYOUT-1); guarantees no two siblings share coordinates.
 */
function layoutAround(
  center: BrainNode | undefined,
  children: BrainNode[],
): BrainNode[] {
  if (children.length === 0) {
    return center ? [{ ...center, pos: { x: 0, y: 0 } }] : [];
  }
  const GAP = 44;
  const RING_STEP = 120;
  // Generous center clearance so wide inner chips never start atop the hub.
  const centerHalf = center ? (center.level <= 1 ? 130 : 70) : 0;
  const baseR = centerHalf + 116;

  const slots = children.map((c) => ({ c, w: estWidth(c) + GAP }));
  const totalW = slots.reduce((s, x) => s + x.w, 0);

  // Choose the fewest concentric rings whose combined circumference (at ~82%
  // fill) holds all the chips — so dense levels become 2–3 tidy rings.
  const FILL = 0.82;
  let rings = 1;
  while (rings < 5) {
    let cap = 0;
    for (let k = 0; k < rings; k++) cap += 2 * Math.PI * (baseR + k * RING_STEP) * FILL;
    if (cap >= totalW) break;
    rings += 1;
  }

  // Per-ring target width PROPORTIONAL to that ring's circumference, so inner
  // (smaller) rings hold fewer chips and outer rings more — balanced fill, no
  // crammed-inner / sparse-outer lopsidedness.
  const circ: number[] = [];
  let sumCirc = 0;
  for (let k = 0; k < rings; k++) {
    circ[k] = 2 * Math.PI * (baseR + k * RING_STEP);
    sumCirc += circ[k];
  }

  const buckets: { c: BrainNode; w: number }[][] = Array.from(
    { length: rings },
    () => [],
  );
  let k = 0;
  let used = 0;
  for (const slot of slots) {
    const target = (totalW * circ[k]) / sumCirc;
    if (k < rings - 1 && buckets[k].length > 0 && used + slot.w > target) {
      k += 1;
      used = 0;
    }
    buckets[k].push(slot);
    used += slot.w;
  }

  // Place each ring with EQUAL angular spacing (a clean circle, not a greedy
  // cumulative arc), alternate rings half-step offset so chips don't line up
  // radially. The measured pass only has to nudge — the read stays concentric.
  const placed: BrainNode[] = [];
  for (let r = 0; r < rings; r++) {
    const items = buckets[r];
    if (items.length === 0) continue;
    const radius = baseR + r * RING_STEP;
    const step = (2 * Math.PI) / items.length;
    const offset = -Math.PI / 2 + (r % 2 ? step / 2 : 0);
    items.forEach((it, idx) => {
      const a = offset + idx * step;
      placed.push({
        ...it.c,
        pos: { x: Math.cos(a) * radius, y: Math.sin(a) * radius },
      });
    });
  }

  if (!center) return placed;
  return [{ ...center, pos: { x: 0, y: 0 } }, ...placed];
}

/**
 * Portal pseudo-nodes for L1 focus+context: each other system that the focused
 * system has a LIVE interchange with becomes a chip at the periphery so threads
 * can anchor without requiring the remote domain to be on screen.
 */
function portalNodesForSystem(
  graph: BrainGraph,
  focusSystem: System,
): ClusterNode[] {
  const others = new Set<System>();
  for (const e of graph.edges) {
    if (e.kind !== "interchange" || e.contract_status !== "live") continue;
    if (e.from.system === e.to.system) continue; // internal — no portal
    if (e.from.system === focusSystem) others.add(e.to.system);
    if (e.to.system === focusSystem) others.add(e.from.system);
  }
  return [...others].sort().map((sys) => {
    const portal: ClusterNode = {
      id: `${focusSystem}.__portal.${sys}`,
      level: 2,
      kind: "domain",
      parentId: focusSystem,
      label: `→ ${sys}`,
      system: focusSystem,
      source: "openapi",
      hosted_by: null,
      fn: null,
      state: "doing",
      liveness: null,
      size: "sm",
      owner: null,
      branch: null,
      last_commit: null,
      docs_ref: null,
      surfaces: [],
      meta: `Cross-system link to ${sys}`,
      summary: null,
      pos: { x: 0, y: 0 },
      isCluster: true,
      clusterKind: "portal",
      portalSystem: sys,
      clusterMembers: [],
    };
    return portal;
  });
}

/**
 * The set of nodes visible at the current view. PURE.
 *
 * - L0 system axis  → the system (L1) hub nodes (portfolio overview).
 * - L0 function axis → the function pseudo-set is handled by the renderer from
 *   graph.functions; here we return [] (functions aren't BrainNodes).
 * - L1 system axis  → the focused system's domains (clustered + capped) + portals.
 * - L1 function axis→ the focused function's member domains.
 * - L2             → the focused domain's surfaces (overflow-clustered).
 */
export function visibleNodes(graph: BrainGraph, q: VisibleQuery): BrainNode[] {
  const expanded = new Set(q.expandedClusters ?? []);

  if (q.level === 0) {
    // Portfolio (system axis) → the system hubs; capability map (function axis)
    // → the synthesized function hubs.
    if (q.axis === "function") return capNodes(functionNodes(graph));
    // Lay the hubs on a compact ring around the origin so the portfolio reads as
    // a tight constellation instead of a sparse scatter in a void (zoom-03): a
    // tighter frame means pinch-zoom lands on/near content, not empty space.
    const hubs = capNodes(graph.nodes.filter((n) => n.level === 1));
    const ring = ringLayout(
      hubs.map((h) => h.id),
      { radius: 360, startAngleDeg: -90 },
    );
    return hubs.map((h) => ({ ...h, pos: ring[h.id] ?? h.pos }));
  }

  if (q.level === 1) {
    if (q.axis === "function") {
      // No focused function → fall back to the function root (defensive).
      if (!q.focusFn) return capNodes(functionNodes(graph));
      const members = domainsOfFn(graph, q.focusFn);
      return capWithOverflow(layoutGrid(members), `fn.${q.focusFn}`, {
        expanded: expanded.has(`fn.${q.focusFn}.__overflow`),
      });
    }
    if (!q.focusSystemId) return [];
    const systemHubId = `${q.focusSystemId}`;
    // The focused system hub is rendered AT CENTER so its domain spokes have an
    // anchor (FR-NAV-6 hub-and-spoke). Domains fan around it on a ring.
    const hub = graph.nodes.find((n) => n.id === systemHubId && n.level === 1);
    const domains = childrenOf(graph, systemHubId).filter((n) => n.level === 2);
    const clustered = clusterNeeded(
      domains,
      systemHubId,
      expanded.has(`${systemHubId}.__roadmap`),
    );
    // Portals for cross-system interchange threads (focus+context).
    const portals = portalNodesForSystem(graph, q.focusSystemId);
    // Cap domains first (leave headroom for portals), then append portals.
    const domainCap = Math.max(8, NODE_CAP - portals.length);
    const cappedDomains = capWithOverflow(clustered, systemHubId, {
      cap: domainCap,
      expanded: expanded.has(`${systemHubId}.__overflow`),
    });
    return layoutAround(hub, [...cappedDomains, ...portals]);
  }

  // L2 (and L3 fallthrough): the focused domain AT CENTER + its surfaces fanned
  // around it. Priority keeps reads_writes endpoints when capping; overflow
  // cluster replaces silent truncation under full inventory.
  if (q.focusDomainId) {
    const domain = graph.nodes.find((n) => n.id === q.focusDomainId);
    const children = childrenOf(graph, q.focusDomainId).filter(
      (n) => n.level === 3,
    );
    const surfaces = capWithOverflow(children, q.focusDomainId, {
      priorityIds: relationalPriorityIds(graph, q.focusDomainId),
      expanded: expanded.has(`${q.focusDomainId}.__overflow`),
    });
    return layoutAround(domain, surfaces);
  }
  return [];
}

/**
 * The React Flow node ids an edge connects to, at a given altitude.
 *
 * THIS IS THE FIX for the silent edge-drop: at L0 the visible nodes ARE the
 * system hubs (ids === the System enum, e.g. "vav"), so interchange stations
 * map by `.system`. At every deeper level the visible nodes are domains/
 * surfaces whose ids are the dotted `.domain` field (e.g. "vav.booking"), so
 * contains/calls/interchange edges MUST map by `.domain` — mapping by `.system`
 * produced endpoints that no visible node owned, and React Flow dropped them.
 * Both `visibleEdges` (membership filter) and every lens (RF edge mapping) go
 * through this one helper so the two can never disagree again (perf-04 dedup).
 */
/**
 * Resolve RF endpoints for an edge at a given altitude.
 *
 * Optional `focusSystem` (L1) rewrites the remote interchange endpoint to a
 * portal chip id (`{focus}.__portal.{other}`) so threads can render without
 * the remote domain being on screen.
 */
export function renderedEndpoints(
  e: BrainEdge,
  level: NodeLevel,
  focusSystem?: System | null,
): { source: string; target: string } {
  if (e.kind === "interchange" && level === 0) {
    return { source: e.from.system, target: e.to.system };
  }
  if (e.kind === "interchange" && level === 1 && focusSystem) {
    // Local domain stays; remote side becomes the portal chip.
    if (e.from.system === focusSystem && e.to.system !== focusSystem) {
      return {
        source: e.from.domain,
        target: `${focusSystem}.__portal.${e.to.system}`,
      };
    }
    if (e.to.system === focusSystem && e.from.system !== focusSystem) {
      return {
        source: `${focusSystem}.__portal.${e.from.system}`,
        target: e.to.domain,
      };
    }
  }
  return { source: e.from.domain, target: e.to.domain };
}

/**
 * Synthesize a parent→child "contains" spoke. Built from `parentId` rather than
 * the data's contains edges because only 15/37 surfaces ship a contains edge —
 * the structural parent link is always known, so the fan is always complete.
 * `needed` children get a planned (dashed/dim) spoke.
 */
function spokeEdge(centerId: string, child: BrainNode): BrainEdge {
  const system = (child.system ?? "vav") as System;
  return {
    id: `spoke.${centerId}.${child.id}`,
    kind: "contains",
    subtype: null,
    from: { system, domain: centerId },
    to: { system, domain: child.id },
    contract_status: child.state === "needed" ? "planned" : "live",
  };
}

/**
 * Edges visible at the current view. PURE. At L0 we surface the LIVE interchange
 * stations (cross-system). On drill-in we synthesize the hub→child spokes (so
 * the map shows a connected fan, not a disconnected dot-field) PLUS any real
 * interchange whose BOTH rendered endpoints are currently on screen — every
 * edge is filtered to the visible node set so none can dangle (link-02 fix).
 */
export function visibleEdges(graph: BrainGraph, q: VisibleQuery): BrainEdge[] {
  // The By-Function axis is a capability grouping, not a wiring diagram — no
  // structural/interchange edges render there in v0 (avoids dangling endpoints
  // since function views don't contain the system/domain nodes the edges name).
  if (q.axis === "function") return [];

  if (q.level === 0) {
    // LIVE cross-system interchanges only. Same-system (e.g. crm→crm overlord)
    // would self-loop on the hub and get dropped by React Flow — exclude them.
    // Planned edges stay off the station layer (panel lists them).
    return graph.edges.filter(
      (e) =>
        e.kind === "interchange" &&
        e.contract_status === "live" &&
        e.from.system !== e.to.system,
    );
  }

  const visible = visibleNodes(graph, q);
  const visibleIds = new Set(visible.map((n) => n.id));
  const centerId = q.level === 1 ? q.focusSystemId ?? null : q.focusDomainId ?? null;

  const out: BrainEdge[] = [];

  // Hub→child spokes (the "linked when you zoom in" fan). Skip portal chips —
  // they get real interchange edges instead of structural contains.
  if (centerId && visibleIds.has(centerId)) {
    for (const n of visible) {
      if (n.id === centerId) continue;
      if (isPortalNode(n)) continue;
      out.push(spokeEdge(centerId, n));
    }
  }

  // Real relational edges that span two on-screen nodes — cross-system
  // interchanges (rewritten to portal chips at L1), plus micro-level
  // reads_writes / calls. Membership-checked through the SAME endpoint
  // resolver the renderer uses, so nothing can dangle.
  const RELATIONAL = new Set(["interchange", "reads_writes", "calls"]);
  for (const e of graph.edges) {
    if (!RELATIONAL.has(e.kind)) continue;
    // Planned interchanges only appear in the panel — portal chips are live-only,
    // so rewriting a planned edge to a missing portal would dangle.
    if (e.kind === "interchange" && e.contract_status !== "live") continue;
    let { source, target } = renderedEndpoints(
      e,
      q.level,
      q.focusSystemId ?? null,
    );
    // L1 interchange: if the local domain was capped off-screen, anchor the
    // thread to the system hub so the portal still shows a real link.
    if (
      e.kind === "interchange" &&
      q.level === 1 &&
      centerId &&
      visibleIds.has(centerId)
    ) {
      if (!visibleIds.has(source) && visibleIds.has(target)) source = centerId;
      if (!visibleIds.has(target) && visibleIds.has(source)) target = centerId;
    }
    if (
      source !== target &&
      visibleIds.has(source) &&
      visibleIds.has(target)
    ) {
      // When we rewrote endpoints for hub fallback, the RF mapper still uses
      // renderedEndpoints — so push a thin clone with domain fields remapped
      // to the actual RF source/target ids (portal/hub).
      if (
        e.kind === "interchange" &&
        q.level === 1 &&
        (source === centerId || target === centerId)
      ) {
        out.push({
          ...e,
          from: { ...e.from, domain: source },
          to: { ...e.to, domain: target },
        });
      } else {
        out.push(e);
      }
    }
  }

  return out;
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
