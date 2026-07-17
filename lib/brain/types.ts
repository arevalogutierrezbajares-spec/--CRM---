/**
 * THE BRAIN — canonical graph schema (brain-graph.json, version "1.1").
 *
 * Source of truth: docs/requirements/THE-BRAIN-HLR.md §10 + the v0 consolidated
 * build plan (docs/requirements/brain-phase1/00-BUILD-PLAN.md §1).
 *
 * v0 renders all 5 systems (VAV, CaneyCloud, AGB-CRM live; Restaurants as a
 * host-mounted territory; Academy as planned/fog-of-war). Every field in the
 * V1.1 spec is *declared* here so the artifact never needs a schema bump when
 * the v1/v2 extractors begin populating contract hashes, liveness, etc.
 * (NFR-FRESH-6). v0 only *populates* a subset.
 *
 * Operator decision (2026-06-21): a 7th business function — `education` — is
 * adopted for Caney Academy (OQ-9). See lib/brain/functions.ts.
 */

export type System = "vav" | "caney" | "crm" | "restaurants" | "academy";

/** 0 portfolio · 1 system · 2 domain · 3 surface (FR-GRAPH-1). */
export type NodeLevel = 0 | 1 | 2 | 3;

export type NodeKind =
  | "system"
  | "domain"
  | "surface"
  | "entity"
  /** Phase 1 — markdown documentation / ADR (not drawn as architecture chips). */
  | "doc"
  | "adr";

/** Derivation provenance (V1.1). `manifest` ⇒ state must be "needed" (NFR-OBS-5). */
export type NodeSource =
  | "openapi"
  | "migrations"
  | "manifest"
  | "host_mount"
  | "docs";

/** The 7 business functions (FR-AXIS-3 + OQ-9 `education`). */
export type Fn =
  | "growth"
  | "sales"
  | "ops"
  | "cx"
  | "admin"
  | "platform"
  | "education";

/** done = built · doing = WIP/release-gated · needed = planned/fog-of-war (FR-PIPE-7). */
export type NodeState = "done" | "doing" | "needed";

/** Runtime health (null until the v2 liveness extractor lands). */
export type Liveness = "ok" | "dead" | "atrophy";

/** ∝ child count — FR-GRAPH-5: ≥3 surfaces ⇒ lg, 1–2 ⇒ md, 0 ⇒ sm. */
export type NodeSize = "sm" | "md" | "lg";

export type EdgeKind =
  | "contains"
  | "calls"
  | "reads_writes"
  | "interchange"
  /** Phase 1 — documentation documents an architecture node. */
  | "documents";

/** `host_mount` = module-mounted-in-host (restaurants → caney);
 * `reads`/`writes` = direction of a reads_writes route→table micro-edge. */
export type EdgeSubtype = "host_mount" | "reads" | "writes" | null;

/** Interchange edge health (FR-XSYS-4). */
export type Health = "ok" | "warn" | "dark";

/** `planned` ⇒ dashed/fog-of-war, hash null, excluded from FR-PIPE-6 hashing. */
export type ContractStatus = "live" | "planned";

export interface XY {
  x: number;
  y: number;
}

export interface BrainNode {
  /** Dotted, globally unique e.g. "vav.bookings". FR-PIPE-13 de-dup key. */
  id: string;
  level: NodeLevel;
  kind: NodeKind;
  /** Parent node id, or null at L0. */
  parentId: string | null;
  label: string;
  /** Restaurants surfaces MUST be "restaurants", never "caney" (FR-PIPE-13). */
  system: System | null;
  source: NodeSource;
  /** Only set for module-mounted systems (restaurants). Else null. */
  hosted_by: "caney" | null;
  fn: Fn | null;
  state: NodeState;
  /** null until the v2 liveness extractor. */
  liveness: Liveness | null;
  size: NodeSize;
  owner: string | null;
  branch: string | null;
  /** Deploy-state extractor (v1). */
  last_commit: string | null;
  /** "openapi#operationId" | mdx | adr | null. */
  docs_ref: string | null;
  /** Domain-level route/file paths. */
  surfaces: string[];
  /** System-level metadata string, e.g. "243 routes · 194 pages · 141 mig". */
  meta: string | null;
  /** Plain-English cartographer summary (v2). null in v0. */
  summary: string | null;
  /** Pinned deterministic coords (seed-then-pin, NFR-LAYOUT-1/2). */
  pos: XY;
}

export interface EdgeEndpoint {
  system: System;
  domain: string;
}

export interface BrainEdge {
  id: string;
  kind: EdgeKind;
  subtype: EdgeSubtype;
  from: EdgeEndpoint;
  to: EdgeEndpoint;
  /** Interchange only. */
  purpose?: string;
  /** Interchange only. */
  health?: Health;
  contract_status: ContractStatus;
  /** e.g. "POST /api/pms/webhook/caneycloud". */
  route?: string;
  /** File path of the contract. */
  contract_ref?: string;
  /** null when contract_status === "planned"; computed v1 (FR-PIPE-5). */
  contract_hash?: string | null;
  version?: string;
  /** "What breaks" impact list (consumer call-sites / failure modes). */
  breaks?: string[];
}

export interface BrainFunction {
  id: Fn;
  /** Display name, e.g. "Sales & Revenue". */
  name: string;
  /** Readiness %: mean(done=1, doing=.5, needed=0) over members, rounded. */
  pct: number;
  /** Node ids across all systems that belong to this function. */
  members: string[];
}

export interface BrainGraph {
  version: "1.1";
  /** ISO timestamp. */
  generatedAt: string;
  /** Per-system commit SHA; academy is null until code exists. */
  commit: Record<System, string | null>;
  nodes: BrainNode[];
  edges: BrainEdge[];
  functions: BrainFunction[];
  /** The external dependencies referenced by the portfolio. */
  externals: string[];
}

/* ────────────────────────────────────────────────────────────────────────
 * Status DOUBLE-ENCODING (FR-GRAPH-4 / NFR-A11Y-1): never color alone.
 * Every status carries a glyph + a text label so it survives grayscale.
 * ──────────────────────────────────────────────────────────────────────── */

/** Node-state glyphs. */
export const STATE_GLYPH: Record<NodeState, string> = {
  done: "✓",
  doing: "◐",
  needed: "○",
};

/** Node-state text labels. */
export const STATE_LABEL: Record<NodeState, string> = {
  done: "BUILT",
  doing: "WIP",
  needed: "NEEDED",
};

/** Interchange-health glyphs. */
export const HEALTH_GLYPH: Record<Health, string> = {
  ok: "✓",
  warn: "!",
  dark: "·",
};

export const HEALTH_LABEL: Record<Health, string> = {
  ok: "LIVE",
  warn: "DEGRADED",
  dark: "DARK",
};

/** Per-system accent tokens (mirror brain.css --vav/--caney/… for JS use). */
export const SYSTEM_ACCENT: Record<System, string> = {
  vav: "#E3B061",
  caney: "#5BBCE6",
  crm: "#B189EE",
  restaurants: "#F0915E",
  academy: "#4FC3A8",
};

export const SYSTEM_LABEL: Record<System, string> = {
  vav: "VAV",
  caney: "CaneyCloud",
  crm: "AGB-CRM",
  restaurants: "Caney Restaurants",
  academy: "Caney Academy",
};

/** FR-GRAPH-5 size bucketing from child/surface count. */
export function sizeForCount(n: number): NodeSize {
  if (n >= 3) return "lg";
  if (n >= 1) return "md";
  return "sm";
}
