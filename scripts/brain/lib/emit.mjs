/**
 * THE BRAIN — node/edge emit factories + GraphBuilder.
 *
 * The ONLY sanctioned way for extractors to produce BrainNode / BrainEdge
 * objects. Every factory returns an object whose field names + enum values
 * match lib/brain/types.ts EXACTLY, with all V1.1 fields declared (nulls for
 * the ones v0 doesn't populate) so the artifact never needs a schema bump
 * (NFR-FRESH-6).
 *
 * Extractors MUST NOT hand-build node/edge literals — go through these so the
 * shape stays uniform and the GraphBuilder can dedupe + wire functions.
 *
 * Domain node ids are canonical slugs of the form `<system>.<domainSlug>` and
 * MUST match the keys of FN_MAP in lib/brain/functions.ts. The GraphBuilder
 * sets node.fn from FN_MAP and computes the functions[] port via
 * computeFunctions().
 */

import {
  sizeForCount,
  SYSTEM_LABEL,
} from "../../../lib/brain/types.ts";
import {
  FN_MAP,
  computeFunctions,
} from "../../../lib/brain/functions.ts";

/** Re-export so extractors can size from a count without a second import. */
export { sizeForCount };

/* ────────────────────────────────────────────────────────────────────────
 * Internal: the full BrainNode field set with V1.1 defaults.
 * Field ORDER here is the canonical key order in the artifact.
 * ──────────────────────────────────────────────────────────────────────── */

function baseNode(partial) {
  return {
    id: partial.id,
    level: partial.level,
    kind: partial.kind,
    parentId: partial.parentId ?? null,
    label: partial.label,
    system: partial.system ?? null,
    source: partial.source,
    hosted_by: partial.hosted_by ?? null,
    fn: partial.fn ?? null,
    state: partial.state ?? "needed",
    liveness: partial.liveness ?? null,
    size: partial.size ?? "sm",
    owner: partial.owner ?? null,
    branch: partial.branch ?? null,
    last_commit: partial.last_commit ?? null,
    docs_ref: partial.docs_ref ?? null,
    surfaces: partial.surfaces ?? [],
    meta: partial.meta ?? null,
    summary: partial.summary ?? null,
    pos: partial.pos ?? { x: 0, y: 0 },
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * Node factories. One per kind/level.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * L1 system node (one per System). id === system, e.g. "vav".
 * @param {object} o
 * @param {import("../../../lib/brain/types.ts").System} o.system
 * @param {import("../../../lib/brain/types.ts").NodeState} [o.state]
 * @param {string|null} [o.meta]   e.g. "243 routes · 194 pages · 141 mig"
 * @param {string|null} [o.label]  defaults to SYSTEM_LABEL[system]
 */
export function systemNode(o) {
  return baseNode({
    id: o.system,
    level: 1,
    kind: "system",
    parentId: o.parentId ?? "portfolio",
    label: o.label ?? SYSTEM_LABEL[o.system],
    system: o.system,
    source: o.source ?? "openapi",
    hosted_by: o.hosted_by ?? null,
    fn: null, // systems are not function-scoped
    state: o.state ?? "doing",
    size: o.size ?? "lg",
    meta: o.meta ?? null,
    owner: o.owner ?? null,
    branch: o.branch ?? null,
    last_commit: o.last_commit ?? null,
    docs_ref: o.docs_ref ?? null,
    summary: o.summary ?? null,
    pos: o.pos,
  });
}

/**
 * L2 domain node. id MUST be a canonical slug `<system>.<domainSlug>` that
 * exists as a key in FN_MAP (functions.ts). fn is resolved from FN_MAP unless
 * explicitly overridden.
 * @param {object} o
 * @param {string} o.id            canonical slug, e.g. "vav.booking"
 * @param {string} o.label
 * @param {import("../../../lib/brain/types.ts").System} o.system
 * @param {import("../../../lib/brain/types.ts").NodeSource} o.source
 * @param {import("../../../lib/brain/types.ts").NodeState} [o.state]
 * @param {string[]} [o.surfaces]
 * @param {number} [o.surfaceCount]  used for size if `size` not given
 */
export function domainNode(o) {
  const surfaces = o.surfaces ?? [];
  const count = o.surfaceCount ?? surfaces.length;
  return baseNode({
    id: o.id,
    level: 2,
    kind: "domain",
    parentId: o.parentId ?? o.system,
    label: o.label,
    system: o.system,
    source: o.source,
    hosted_by: o.hosted_by ?? null,
    fn: o.fn ?? FN_MAP[o.id] ?? null,
    state: o.state ?? "needed",
    liveness: o.liveness ?? null,
    size: o.size ?? sizeForCount(count),
    surfaces,
    owner: o.owner ?? null,
    branch: o.branch ?? null,
    last_commit: o.last_commit ?? null,
    docs_ref: o.docs_ref ?? null,
    meta: o.meta ?? null,
    summary: o.summary ?? null,
    pos: o.pos,
  });
}

/**
 * L3 surface node (route / page / file). parentId is its domain slug.
 * @param {object} o
 * @param {string} o.id
 * @param {string} o.label
 * @param {string} o.parentId      domain slug
 * @param {import("../../../lib/brain/types.ts").System} o.system
 * @param {import("../../../lib/brain/types.ts").NodeSource} o.source
 */
export function surfaceNode(o) {
  return baseNode({
    id: o.id,
    level: 3,
    kind: "surface",
    parentId: o.parentId,
    label: o.label,
    system: o.system,
    source: o.source,
    hosted_by: o.hosted_by ?? null,
    fn: o.fn ?? null,
    state: o.state ?? "done",
    liveness: o.liveness ?? null,
    size: o.size ?? "sm",
    surfaces: o.surfaces ?? [],
    owner: o.owner ?? null,
    branch: o.branch ?? null,
    last_commit: o.last_commit ?? null,
    docs_ref: o.docs_ref ?? null,
    meta: o.meta ?? null,
    summary: o.summary ?? null,
    pos: o.pos,
  });
}

/**
 * Entity node (DB table from a migration / schema). kind "entity".
 * parentId is the domain slug it belongs to. Migration-sourced ⇒ state defaults
 * "needed" per NFR-OBS-5 caller responsibility; pass state explicitly otherwise.
 * @param {object} o
 * @param {string} o.id
 * @param {string} o.label
 * @param {string} o.parentId      domain slug
 * @param {import("../../../lib/brain/types.ts").System} o.system
 */
export function entityNode(o) {
  return baseNode({
    id: o.id,
    level: o.level ?? 3,
    kind: "entity",
    parentId: o.parentId,
    label: o.label,
    system: o.system,
    source: o.source ?? "migrations",
    hosted_by: o.hosted_by ?? null,
    fn: o.fn ?? null,
    state: o.state ?? "done",
    liveness: o.liveness ?? null,
    size: o.size ?? "sm",
    surfaces: o.surfaces ?? [],
    owner: o.owner ?? null,
    branch: o.branch ?? null,
    last_commit: o.last_commit ?? null,
    docs_ref: o.docs_ref ?? null,
    meta: o.meta ?? null,
    summary: o.summary ?? null,
    pos: o.pos,
  });
}

/* ────────────────────────────────────────────────────────────────────────
 * Edge factories. Canonical key order matches lib/brain/types.ts BrainEdge.
 * ──────────────────────────────────────────────────────────────────────── */

function baseEdge(partial) {
  const e = {
    id: partial.id,
    kind: partial.kind,
    subtype: partial.subtype ?? null,
    from: partial.from,
    to: partial.to,
  };
  // Optional fields are only included when provided, preserving a stable order.
  if (partial.purpose !== undefined) e.purpose = partial.purpose;
  if (partial.health !== undefined) e.health = partial.health;
  e.contract_status = partial.contract_status ?? "live";
  if (partial.route !== undefined) e.route = partial.route;
  if (partial.contract_ref !== undefined) e.contract_ref = partial.contract_ref;
  // contract_hash: null in v0 (hashing off). Always present for interchange.
  if (partial.contract_hash !== undefined) e.contract_hash = partial.contract_hash;
  if (partial.version !== undefined) e.version = partial.version;
  if (partial.breaks !== undefined) e.breaks = partial.breaks;
  return e;
}

/**
 * Structural / call edge ("contains" | "calls" | "reads_writes").
 * from/to are {system, domain} endpoints.
 * @param {object} o
 * @param {string} o.id
 * @param {import("../../../lib/brain/types.ts").EdgeKind} o.kind
 * @param {import("../../../lib/brain/types.ts").EdgeEndpoint} o.from
 * @param {import("../../../lib/brain/types.ts").EdgeEndpoint} o.to
 */
export function edge(o) {
  return baseEdge({
    id: o.id,
    kind: o.kind,
    subtype: o.subtype ?? null,
    from: o.from,
    to: o.to,
    contract_status: o.contract_status ?? "live",
    route: o.route,
    contract_ref: o.contract_ref,
    contract_hash: o.contract_hash,
    version: o.version,
    breaks: o.breaks,
  });
}

/**
 * Interchange edge (cross-system station, FR-XSYS-1). kind "interchange".
 * Always carries purpose + health; contract_hash defaults null in v0.
 * @param {object} o
 * @param {string} o.id              e.g. "ix1"
 * @param {import("../../../lib/brain/types.ts").EdgeEndpoint} o.from
 * @param {import("../../../lib/brain/types.ts").EdgeEndpoint} o.to
 * @param {string} o.purpose
 * @param {import("../../../lib/brain/types.ts").Health} o.health
 * @param {import("../../../lib/brain/types.ts").ContractStatus} [o.contract_status]
 * @param {import("../../../lib/brain/types.ts").EdgeSubtype} [o.subtype]
 */
export function interchange(o) {
  const planned = (o.contract_status ?? "live") === "planned";
  return baseEdge({
    id: o.id,
    kind: "interchange",
    subtype: o.subtype ?? null,
    from: o.from,
    to: o.to,
    purpose: o.purpose,
    health: o.health,
    contract_status: o.contract_status ?? "live",
    route: o.route,
    contract_ref: o.contract_ref,
    // planned interchanges have null hash; live ones are null in v0 (hashing off).
    contract_hash: o.contract_hash ?? null,
    version: o.version,
    breaks: o.breaks,
  });
}

/* ────────────────────────────────────────────────────────────────────────
 * GraphBuilder — accumulate, dedupe, wire functions, emit a BrainGraph.
 * ──────────────────────────────────────────────────────────────────────── */

export class GraphBuilder {
  constructor() {
    /** @type {Map<string, import("../../../lib/brain/types.ts").BrainNode>} */
    this._nodes = new Map();
    /** @type {Map<string, import("../../../lib/brain/types.ts").BrainEdge>} */
    this._edges = new Map();
    /** @type {Record<string, string|null>} */
    this._commit = {
      vav: null,
      caney: null,
      crm: null,
      restaurants: null,
      academy: null,
    };
    /** @type {string[]} */
    this._externals = [];
  }

  /** Add one node; later writes to the same id win (last-write-wins merge). */
  addNode(node) {
    this._nodes.set(node.id, node);
    return this;
  }

  /** Add many nodes. Accepts an array (ignores falsy entries). */
  addNodes(nodes) {
    for (const n of nodes ?? []) if (n) this.addNode(n);
    return this;
  }

  /** Add one edge, deduped by id. */
  addEdge(e) {
    this._edges.set(e.id, e);
    return this;
  }

  /** Add many edges. */
  addEdges(edges) {
    for (const e of edges ?? []) if (e) this.addEdge(e);
    return this;
  }

  /** Set the commit SHA for a system (e.g. from `git rev-parse`). */
  setCommit(system, sha) {
    this._commit[system] = sha ?? null;
    return this;
  }

  /** Set the externals list (replaces). */
  setExternals(externals) {
    this._externals = [...(externals ?? [])];
    return this;
  }

  /** All accumulated nodes (deduped) in insertion order. */
  nodes() {
    return [...this._nodes.values()];
  }

  /** All accumulated edges (deduped) in insertion order. */
  edges() {
    return [...this._edges.values()];
  }

  /**
   * Re-resolve every domain node's `fn` from FN_MAP (functions.ts) so the
   * canonical-slug → function mapping is the single source of truth, then
   * build the functions[] port via computeFunctions().
   * @returns {import("../../../lib/brain/types.ts").BrainFunction[]}
   */
  computeFunctions() {
    const nodes = this.nodes();
    for (const n of nodes) {
      if (n.kind === "domain" && FN_MAP[n.id] !== undefined) {
        n.fn = FN_MAP[n.id];
      }
    }
    return computeFunctions(nodes);
  }

  /**
   * Emit the finished BrainGraph. Stable: nodes/edges in insertion order,
   * functions in FUNCS order. `generatedAt` is supplied by the orchestrator so
   * the artifact is byte-identical modulo that one field (NFR-FRESH-5).
   * @param {object} [o]
   * @param {string} [o.generatedAt] ISO timestamp (defaults to now).
   * @returns {import("../../../lib/brain/types.ts").BrainGraph}
   */
  toGraph(o = {}) {
    const functions = this.computeFunctions();
    return {
      version: "1.1",
      generatedAt: o.generatedAt ?? new Date().toISOString(),
      commit: {
        vav: this._commit.vav,
        caney: this._commit.caney,
        crm: this._commit.crm,
        restaurants: this._commit.restaurants,
        academy: this._commit.academy,
      },
      nodes: this.nodes(),
      edges: this.edges(),
      functions,
      externals: [...this._externals],
    };
  }
}
