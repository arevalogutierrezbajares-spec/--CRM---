/**
 * Deterministic route / error signature → brain node id mapping (P3).
 * Config-driven; no network. Extend patterns as Sentry projects grow.
 */

export type ErrorMapRule = {
  /** Case-insensitive substring or simple glob (* suffix/prefix) */
  pattern: string;
  brainNodeId: string;
  note?: string;
};

/** Default patterns for the AGB portfolio (CRM-first). */
export const DEFAULT_ERROR_MAP: ErrorMapRule[] = [
  { pattern: "/api/email", brainNodeId: "crm", note: "Email module surfaces" },
  { pattern: "email-sync", brainNodeId: "crm", note: "Email sync cron" },
  { pattern: "partner", brainNodeId: "crm.partner-rooms", note: "Partner rooms" },
  { pattern: "partner-room", brainNodeId: "crm.partner-rooms" },
  { pattern: "posada", brainNodeId: "crm", note: "Posada onboarding — refine when domain id stable" },
  { pattern: "/api/holds", brainNodeId: "vav.booking", note: "VAV holds" },
  { pattern: "post-api-holds", brainNodeId: "vav.surface.post-api-holds" },
  { pattern: "/brain", brainNodeId: "crm", note: "Brain route / tools" },
  { pattern: "brain_search", brainNodeId: "crm" },
  { pattern: "whatsapp", brainNodeId: "crm" },
  { pattern: "caney", brainNodeId: "caney" },
  { pattern: "booking", brainNodeId: "vav.booking" },
];

function matchPattern(hay: string, pattern: string): boolean {
  const h = hay.toLowerCase();
  const p = pattern.toLowerCase();
  if (p.startsWith("*") && p.endsWith("*")) return h.includes(p.slice(1, -1));
  if (p.startsWith("*")) return h.endsWith(p.slice(1));
  if (p.endsWith("*")) return h.startsWith(p.slice(0, -1));
  return h.includes(p);
}

export type CorrelateErrorResult = {
  ok: true;
  input: string;
  matches: Array<{ brainNodeId: string; pattern: string; note?: string }>;
  primaryId: string | null;
  /** Always false here — Sentry fetch is optional wrapper responsibility */
  sentryAttached: false;
};

/**
 * Map an error message, route, or stack snippet to candidate brain nodes.
 */
export function correlateErrorSignature(
  input: string,
  rules: ErrorMapRule[] = DEFAULT_ERROR_MAP,
): CorrelateErrorResult {
  const text = (input ?? "").trim();
  const matches: CorrelateErrorResult["matches"] = [];
  for (const r of rules) {
    if (matchPattern(text, r.pattern)) {
      matches.push({
        brainNodeId: r.brainNodeId,
        pattern: r.pattern,
        note: r.note,
      });
    }
  }
  // de-dupe by brainNodeId keeping first
  const seen = new Set<string>();
  const uniq = matches.filter((m) => {
    if (seen.has(m.brainNodeId)) return false;
    seen.add(m.brainNodeId);
    return true;
  });
  return {
    ok: true,
    input: text,
    matches: uniq,
    primaryId: uniq[0]?.brainNodeId ?? null,
    sentryAttached: false,
  };
}
