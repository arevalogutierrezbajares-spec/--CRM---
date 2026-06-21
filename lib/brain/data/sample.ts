/**
 * THE BRAIN — hand-authored 5-system fallback graph (SAMPLE).
 *
 * This is the shell's fallback BEFORE the extractor pipeline writes
 * lib/brain/generated/brain-graph.json. It is a realistic, fully-typed
 * BrainGraph honoring the locked scope (DECISIONS.md): ALL 5 systems render in
 * v0 — VAV / CaneyCloud / AGB-CRM live, Caney Restaurants host-mounted, Caney
 * Academy planned-from-manifest.
 *
 * Contents:
 *  - 5 system (L1) hubs + their domains (L2), ~8 canonical-slug domains each
 *    (slugs match lib/brain/functions.ts FN_MAP so `fn` resolves).
 *  - 5 LIVE interchange edges (rendered as L0 stations) + 4 V1.1 edges
 *    (1 live host_mount, 3 planned) — schema-present per the build plan.
 *  - functions[] computed via computeFunctions (7 functions incl. education).
 *  - the 9 externals.
 *
 * Positions: domains are pinned on a deterministic ring around each system hub
 * (radialLayout slots → translated into a per-system local frame), so the
 * sample renders without a layout pass. System hubs sit on a portfolio ring.
 */

import { computeFunctions, fnForDomain } from "../functions";
import { ringLayout } from "../layout/radial";
import type {
  BrainEdge,
  BrainGraph,
  BrainNode,
  Fn,
  NodeSource,
  NodeState,
  System,
  XY,
} from "../types";
import { sizeForCount } from "../types";

/* ── Domain spec per system (slug must match FN_MAP) ─────────────────────── */

interface DomainSpec {
  /** slug after the system prefix, e.g. "booking" → id "vav.booking". */
  slug: string;
  label: string;
  state: NodeState;
  /** representative surfaces (drives size bucketing + the L2 detail panel). */
  surfaces: string[];
}

interface SystemSpec {
  system: System;
  label: string;
  source: NodeSource;
  hosted_by: "caney" | null;
  /** system-level metadata string. */
  meta: string;
  commit: string | null;
  domains: DomainSpec[];
}

const SYSTEMS: SystemSpec[] = [
  {
    system: "vav",
    label: "VAV",
    source: "openapi",
    hosted_by: null,
    meta: "10 domains · 94 mig · 141 tables",
    commit: "f8529baf6",
    domains: [
      { slug: "marketplace", label: "Marketplace Core", state: "done", surfaces: ["GET /api/listings/{slug}", "GET /api/packages", "/app/(tourist)"] },
      { slug: "booking", label: "Booking Pipeline", state: "done", surfaces: ["POST /api/quotes", "POST /api/holds", "GET /api/holds/{id}"] },
      { slug: "pms-integration", label: "PMS Integration", state: "done", surfaces: ["POST /api/pms/webhook/caneyclouds", "GET /api/pms/health"] },
      { slug: "identity", label: "Identity & Access", state: "done", surfaces: ["/app/(auth)", "/lib/auth", "/app/(provider)"] },
      { slug: "payments", label: "Payments & Money", state: "done", surfaces: ["POST /api/stripe/checkout", "POST /api/stripe/webhooks", "/api/payouts"] },
      { slug: "messaging-crm", label: "Messaging & CRM", state: "doing", surfaces: ["POST /api/whatsapp/webhook", "/lib/crm"] },
      { slug: "operator", label: "Operator Features", state: "done", surfaces: ["/api/cron/pms-watchdog", "/api/cron/parity-audit", "/app/(admin)/pms"] },
      { slug: "growth-affiliates", label: "Growth & Affiliates", state: "doing", surfaces: ["/api/discount-codes", "/api/affiliate"] },
      { slug: "ruta-rides", label: "Ruta Rides", state: "needed", surfaces: ["/app/(ruta)", "/api/ruta"] },
      { slug: "specialized-content", label: "Specialized Content", state: "doing", surfaces: ["/api/experience-products", "/lib/birding", "/lib/food"] },
    ],
  },
  {
    system: "caney",
    label: "CaneyCloud",
    source: "openapi",
    hosted_by: null,
    meta: "9 domains · 136 mig · v1.0.3",
    commit: "ed07cca2",
    domains: [
      { slug: "booking-core", label: "Booking Core", state: "done", surfaces: ["POST /bookings/hold", "POST /bookings/confirm", "POST /bookings/{id}/cancel"] },
      { slug: "availability", label: "Availability & Inventory", state: "done", surfaces: ["GET /availability", "POST /availability/block", "POST /internal/availability/check"] },
      { slug: "pricing", label: "Pricing & Quotes", state: "done", surfaces: ["POST /quotes", "POST /internal/quotes/compute"] },
      { slug: "properties", label: "Properties & Rooms", state: "done", surfaces: ["GET/POST /admin/properties", "GET/POST /admin/properties/{id}/rooms"] },
      { slug: "messaging", label: "Messaging & Comms", state: "done", surfaces: ["POST /api/internal/messaging/ingest", "POST /comms/send-email"] },
      { slug: "payments", label: "Payments & Finance", state: "done", surfaces: ["POST /internal/payment-links", "POST /webhooks/stripe", "POST /webhooks/bdv"] },
      { slug: "accounting", label: "Accounting & Reporting", state: "doing", surfaces: ["GET /accounting/dashboard", "GET /accounting/journal-entries"] },
      { slug: "channels", label: "Channels & Distribution", state: "doing", surfaces: ["GET/POST /admin/channels", "POST /api/internal/channel-outbox/drain"] },
      { slug: "auth", label: "Auth & Access", state: "done", surfaces: ["/auth", "/permissions", "/staff"] },
    ],
  },
  {
    system: "crm",
    label: "AGB-CRM",
    source: "openapi",
    hosted_by: null,
    meta: "12 domains · 25 mig · ~140 tables",
    commit: "6c0f706",
    domains: [
      { slug: "contacts", label: "Contacts & Network", state: "done", surfaces: ["/api/capture/members", "/api/contact-logo"] },
      { slug: "projects", label: "Projects & Portfolio", state: "done", surfaces: ["/api/export/projects", "/api/materials/[id]/view"] },
      { slug: "meetings", label: "Meetings & Touches", state: "done", surfaces: ["/api/voice/transcribe", "/api/meetings"] },
      { slug: "research", label: "Research & Intelligence", state: "done", surfaces: ["POST /api/research/sync", "GET /api/research/[id]"] },
      { slug: "treasury", label: "Treasury & Finance", state: "doing", surfaces: ["/api/equity/advisor"] },
      { slug: "email", label: "Email", state: "done", surfaces: ["/api/email", "/api/postmark/inbound"] },
      { slug: "partner-rooms", label: "Partner Rooms", state: "done", surfaces: ["/api/access/[token]", "/api/partner-uploads"] },
      { slug: "overlord", label: "Overlord & Work Mgmt", state: "done", surfaces: ["POST /api/overlord/sync"] },
      { slug: "capture", label: "Voice & Capture", state: "done", surfaces: ["/api/voice/call", "/api/capture", "/api/agent/transcribe"] },
      { slug: "pitch-feedback", label: "Pitch Feedback", state: "doing", surfaces: ["/app/presentations"] },
      { slug: "reminders", label: "Reminders & Nudges", state: "done", surfaces: ["/api/cron/reminders", "/api/cron/nudges"] },
      { slug: "intelligence", label: "Intelligence & AI", state: "doing", surfaces: ["/api/dashboard/ai-actions", "/api/mcp", "/api/brain/feedback"] },
    ],
  },
  {
    system: "restaurants",
    label: "Caney Restaurants",
    source: "host_mount",
    hosted_by: "caney",
    meta: "host-mounted · 13 modules · darktest",
    commit: null,
    domains: [
      { slug: "floor-ops", label: "Floor Operations", state: "doing", surfaces: ["/api/v1/m02/seating", "/api/v1/m02/reservations"] },
      { slug: "pos", label: "Order Management", state: "doing", surfaces: ["/api/v1/m02/orders", "/api/v1/m02/checkout"] },
      { slug: "kds", label: "Kitchen Display", state: "doing", surfaces: ["/api/v1/m_kds (SSE)"] },
      { slug: "inventory", label: "Inventory & Recipes", state: "doing", surfaces: ["/api/v1/m_inv/surface"] },
      { slug: "payments", label: "Payment & Settlement", state: "doing", surfaces: ["/api/v1/m01/payment-sessions", "/api/v1/m01/acquirer"] },
      { slug: "fiscal", label: "Fiscal & Tax (SENIAT)", state: "doing", surfaces: ["/api/v1/m_fiscal/documents"] },
      { slug: "guest-crm", label: "Guest Intelligence & CRM", state: "needed", surfaces: ["/api/v1/m02/guest-segment", "/api/v1/m02/crm-outreach"] },
      { slug: "operator-console", label: "Operator Console", state: "doing", surfaces: ["/api/v1/operator", "GET /api/v1/platform/release-mode"] },
      { slug: "identity", label: "Identity & Access Control", state: "doing", surfaces: ["/api/v1/auth/ops", "/api/v1/auth/step-up"] },
    ],
  },
  {
    system: "academy",
    label: "Caney Academy",
    source: "manifest",
    hosted_by: null,
    meta: "planned · 14 modules · 4 trails",
    commit: null,
    domains: [
      { slug: "curriculum", label: "Curriculum Content", state: "needed", surfaces: ["CURRICULUM.md (planned)"] },
      { slug: "species-ref", label: "Species Reference", state: "needed", surfaces: ["endemic-species-catalog.md (planned)"] },
      { slug: "hotspots", label: "Regional Hotspots", state: "needed", surfaces: ["regional-hotspots.md (planned)"] },
      { slug: "assessment", label: "Assessment & Certification", state: "needed", surfaces: ["lms-integration-plan.md §6 (planned)"] },
      { slug: "localization", label: "Localization", state: "needed", surfaces: ["bilingual framework (planned)"] },
      { slug: "certification", label: "Certificate Issuance", state: "needed", surfaces: ["Certificate model (planned)"] },
      { slug: "enrollment", label: "Enrollment", state: "needed", surfaces: ["enrollment intake (planned)"] },
    ],
  },
];

/* ── Portfolio ring (system hubs) ────────────────────────────────────────── */
const SYSTEM_RING_RADIUS = 360;
const DOMAIN_RING_RADIUS = 300;

const systemPositions: Record<string, XY> = ringLayout(
  SYSTEMS.map((s) => s.system),
  { radius: SYSTEM_RING_RADIUS, startAngleDeg: -90 },
);

/** Place domains on a deterministic ring centered on their system hub. */
function domainPositions(spec: SystemSpec): Record<string, XY> {
  const hub = systemPositions[spec.system] ?? { x: 0, y: 0 };
  const slots = ringLayout(
    spec.domains.map((d) => `${spec.system}.${d.slug}`),
    { radius: DOMAIN_RING_RADIUS, startAngleDeg: -90 },
  );
  const out: Record<string, XY> = {};
  for (const [id, pos] of Object.entries(slots)) {
    out[id] = { x: hub.x + pos.x, y: hub.y + pos.y };
  }
  return out;
}

/* ── Build nodes ─────────────────────────────────────────────────────────── */

const nodes: BrainNode[] = [];

for (const spec of SYSTEMS) {
  const hubPos = systemPositions[spec.system] ?? { x: 0, y: 0 };
  const builtCount = spec.domains.filter((d) => d.state !== "needed").length;

  // System (L1) hub node.
  nodes.push({
    id: spec.system,
    level: 1,
    kind: "system",
    parentId: null,
    label: spec.label,
    system: spec.system,
    source: spec.source,
    hosted_by: spec.hosted_by,
    fn: null,
    state: builtCount === 0 ? "needed" : builtCount < spec.domains.length ? "doing" : "done",
    liveness: null,
    size: sizeForCount(spec.domains.length),
    owner: null,
    branch: null,
    last_commit: spec.commit,
    docs_ref: null,
    surfaces: [],
    meta: spec.meta,
    summary: null,
    pos: hubPos,
  });

  // Domain (L2) nodes.
  const dpos = domainPositions(spec);
  for (const d of spec.domains) {
    const id = `${spec.system}.${d.slug}`;
    const fn: Fn | null = fnForDomain(id);
    nodes.push({
      id,
      level: 2,
      kind: "domain",
      parentId: spec.system,
      label: d.label,
      system: spec.system,
      source: spec.source,
      hosted_by: spec.hosted_by,
      fn,
      state: d.state,
      liveness: null,
      size: sizeForCount(d.surfaces.length),
      owner: null,
      branch: null,
      last_commit: null,
      docs_ref: null,
      surfaces: d.surfaces,
      meta: null,
      summary: null,
      pos: dpos[id] ?? hubPos,
    });
  }
}

/* ── Edges: 5 LIVE interchanges + 4 V1.1 (1 live host_mount, 3 planned) ───── */

const edges: BrainEdge[] = [
  {
    id: "ix1",
    kind: "interchange",
    subtype: null,
    from: { system: "vav", domain: "pms-integration" },
    to: { system: "caney", domain: "booking-core" },
    purpose: "PMS availability + booking sync (HMAC-SHA256 webhook)",
    health: "ok",
    contract_status: "live",
    route: "POST /api/pms/webhook/caneyclouds",
    contract_ref: "VZ_Tourism_Project/docs/pms-integration/05-api/openapi.yaml",
    contract_hash: null,
    version: "1.0.3",
  },
  {
    id: "ix2",
    kind: "interchange",
    subtype: null,
    from: { system: "crm", domain: "research" },
    to: { system: "vav", domain: "identity" },
    purpose: "Service-role read of VAV platform status into CRM intelligence",
    health: "ok",
    contract_status: "live",
    route: "VAV_SUPABASE_* service-role read",
    contract_ref: "AGB-CRM/lib/platforms/status.server.ts",
    contract_hash: null,
  },
  {
    id: "ix3",
    kind: "interchange",
    subtype: null,
    from: { system: "crm", domain: "projects" },
    to: { system: "caney", domain: "properties" },
    purpose: "Posada onboarding intake (FF_ONBOARDING, dark)",
    health: "warn",
    contract_status: "live",
    route: "posada onboarding intake",
    contract_ref: "AGB-CRM/lib/onboarding/intake-contract.ts",
    contract_hash: null,
    breaks: ["onboarding intake stalls", "property mirror drifts"],
  },
  {
    id: "ix4",
    kind: "interchange",
    subtype: null,
    from: { system: "caney", domain: "messaging" },
    to: { system: "crm", domain: "intelligence" },
    purpose: "MCP client reads guest CRM context",
    health: "ok",
    contract_status: "live",
    route: "MCP guest CRM client",
    contract_ref: "tour-pms-main/.../mcp_registry.py",
    contract_hash: null,
  },
  {
    id: "ix5",
    kind: "interchange",
    subtype: null,
    from: { system: "crm", domain: "overlord" },
    to: { system: "crm", domain: "projects" },
    purpose: "Overlord board ⇄ portfolio sync",
    health: "ok",
    contract_status: "live",
    route: "POST /api/overlord/sync",
    contract_ref: "AGB-CRM/docs/VAV-CaneyCloud-CRM-sync-status.md",
    contract_hash: null,
  },
  // ── V1.1: live host_mount (Restaurants → CaneyCloud) ──
  {
    id: "ix6",
    kind: "interchange",
    subtype: "host_mount",
    from: { system: "restaurants", domain: "operator-console" },
    to: { system: "caney", domain: "auth" },
    purpose: "Module mounted in CaneyCloud host (release-mode gate)",
    health: "ok",
    contract_status: "live",
    route: "GET /api/v1/platform/release-mode",
    contract_ref: "caneycloud-restaurant/MODULE-INTEGRATION.md",
    contract_hash: null,
  },
  // ── V1.1: planned (Academy + Restaurants↔VAV) ──
  {
    id: "ix7",
    kind: "interchange",
    subtype: null,
    from: { system: "vav", domain: "marketplace" },
    to: { system: "restaurants", domain: "floor-ops" },
    purpose: "Dining experiences into the marketplace",
    health: "dark",
    contract_status: "planned",
    contract_hash: null,
  },
  {
    id: "ix8",
    kind: "interchange",
    subtype: null,
    from: { system: "academy", domain: "certification" },
    to: { system: "vav", domain: "identity" },
    purpose: "Certified guides → provider supply",
    health: "dark",
    contract_status: "planned",
    contract_hash: null,
  },
  {
    id: "ix9",
    kind: "interchange",
    subtype: null,
    from: { system: "academy", domain: "enrollment" },
    to: { system: "crm", domain: "contacts" },
    purpose: "Enrollment intake → CRM contacts",
    health: "dark",
    contract_status: "planned",
    contract_hash: null,
  },
];

/* ── Assemble ────────────────────────────────────────────────────────────── */

const commit: Record<System, string | null> = {
  vav: "f8529baf6",
  caney: "ed07cca2",
  crm: "6c0f706",
  restaurants: null,
  academy: null,
};

/** The 9 external dependencies referenced across the portfolio. */
export const EXTERNALS: string[] = [
  "Stripe",
  "Anthropic",
  "WhatsApp",
  "Mapbox",
  "SiteMinder",
  "Inngest",
  "Resend",
  "PostHog",
  "Sentry",
];

export const SAMPLE: BrainGraph = {
  version: "1.1",
  generatedAt: "2026-06-21T00:00:00.000Z",
  commit,
  nodes,
  edges,
  // functions[] computed from the L2 domain nodes (7 functions, incl. education).
  functions: computeFunctions(nodes.filter((n) => n.level === 2)),
  externals: EXTERNALS,
};
