/**
 * THE BRAIN — the By-Function capability map (FR-AXIS-3/4).
 *
 * 7 business functions (operator decision 2026-06-21, OQ-9: a dedicated
 * `education` function was adopted for Caney Academy rather than folding it
 * into cx/ops/sales). Each derived domain is assigned to exactly one function.
 *
 * `pct` (readiness) is computed at build time from member node states:
 * mean(done=1, doing=.5, needed=0), rounded.
 */

import type { BrainFunction, BrainNode, Fn } from "./types";

export interface FunctionDef {
  id: Fn;
  name: string;
  blurb: string;
}

/** The 7 functions, in display order. */
export const FUNCS: FunctionDef[] = [
  { id: "growth", name: "Marketing & Growth", blurb: "Acquisition, content, affiliates, referral." },
  { id: "sales", name: "Sales & Revenue", blurb: "Booking, commerce, pricing, monetization." },
  { id: "ops", name: "Operations", blurb: "Inventory, fulfillment, work management." },
  { id: "cx", name: "Customer Experience", blurb: "Messaging, support, guest relations." },
  { id: "admin", name: "Business Admin & Finance", blurb: "Payments, accounting, treasury, fiscal." },
  { id: "platform", name: "Platform & Data", blurb: "Identity, access, data, intelligence." },
  { id: "education", name: "Education & Training", blurb: "Curriculum, certification, guide enablement." },
];

/** Function-overlay accent palette (7 well-separated hues). FR-LENS function overlay. */
export const FN_COLOR: Record<Fn, string> = {
  growth: "#E8896B", // coral
  sales: "#5ED6A6", // green
  ops: "#7E8CF0", // indigo
  cx: "#E87FB8", // pink
  admin: "#4FC9C0", // teal
  platform: "#94A3C7", // slate
  education: "#E8C45E", // amber/gold
};

export const FN_LABEL: Record<Fn, string> = Object.fromEntries(
  FUNCS.map((f) => [f.id, f.name]),
) as Record<Fn, string>;

/**
 * Canonical domain → function assignment. Keyed by node id (system.domainSlug)
 * so the extractor and the overlay agree. Extractors set node.fn from this map;
 * unknown domains fall back to `null` (uncategorized — surfaced in the legend).
 *
 * Derived from the surface maps in docs/requirements/brain-phase1/. Academy
 * domains route to `education`.
 */
export const FN_MAP: Record<string, Fn> = {
  // ── VAV ──
  "vav.marketplace": "growth",
  "vav.specialized-content": "growth",
  "vav.growth-affiliates": "growth",
  "vav.booking": "sales",
  "vav.pms-integration": "sales",
  "vav.ruta-rides": "sales",
  "vav.operator": "ops",
  "vav.messaging-crm": "cx",
  "vav.payments": "admin",
  "vav.identity": "platform",

  // ── CaneyCloud ──
  "caney.booking-core": "sales",
  "caney.availability": "sales",
  "caney.pricing": "sales",
  "caney.properties": "ops",
  "caney.channels": "ops",
  "caney.messaging": "cx",
  "caney.payments": "admin",
  "caney.accounting": "admin",
  "caney.auth": "platform",

  // ── AGB-CRM ──
  "crm.pitch-feedback": "growth",
  "crm.partner-rooms": "growth",
  "crm.projects": "ops",
  "crm.overlord": "ops",
  "crm.intelligence": "ops",
  "crm.contacts": "cx",
  "crm.meetings": "cx",
  "crm.email": "cx",
  "crm.capture": "cx",
  "crm.reminders": "cx",
  "crm.treasury": "admin",
  "crm.research": "platform",

  // ── Caney Restaurants (host-mounted) ──
  "restaurants.pos": "sales",
  "restaurants.payments": "admin",
  "restaurants.kds": "ops",
  "restaurants.inventory": "ops",
  "restaurants.floor-ops": "ops",
  "restaurants.operator-console": "ops",
  "restaurants.diner-web": "cx",
  "restaurants.guest-crm": "cx",
  "restaurants.fiscal": "admin",
  "restaurants.accounting": "admin",
  "restaurants.menu": "growth",
  "restaurants.onboarding": "growth",
  "restaurants.identity": "platform",

  // ── Caney Academy (planned) → education ──
  "academy.curriculum": "education",
  "academy.species-ref": "education",
  "academy.hotspots": "education",
  "academy.localization": "education",
  "academy.assessment": "education",
  "academy.certification": "education",
  "academy.enrollment": "education",
};

const STATE_WEIGHT = { done: 1, doing: 0.5, needed: 0 } as const;

/**
 * Build the functions[] array for a graph from its domain-level nodes.
 * Members = node ids whose `fn` matches; pct = weighted-mean readiness.
 */
export function computeFunctions(nodes: BrainNode[]): BrainFunction[] {
  return FUNCS.map((def) => {
    const members = nodes.filter((n) => n.fn === def.id);
    const pct =
      members.length === 0
        ? 0
        : Math.round(
            (members.reduce((s, n) => s + STATE_WEIGHT[n.state], 0) /
              members.length) *
              100,
          );
    return {
      id: def.id,
      name: def.name,
      pct,
      members: members.map((n) => n.id),
    };
  });
}

/** Resolve a domain node id to its function (build-time helper for extractors). */
export function fnForDomain(nodeId: string): Fn | null {
  return FN_MAP[nodeId] ?? null;
}
