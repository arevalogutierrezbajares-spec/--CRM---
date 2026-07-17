/**
 * THE BRAIN — derivation-pipeline configuration.
 *
 * Single source of truth for the deterministic extractor pipeline
 * (scripts/brain/**). All extractors are read-only (NFR-SEC-3) and consume the
 * absolute repo roots declared here. Every root is env-overridable so CI (v1)
 * can point at checkout paths without editing code.
 *
 * v0 reads ONLY local clones — no network, no credentials needed. The CREDS
 * placeholder exists so the v1 CI-wired regen has a typed home for read-only
 * tokens, but it is NEVER serialized into brain-graph.json (NFR-SEC-4).
 */

/**
 * Absolute filesystem roots for every source repo the pipeline reads.
 * Override any value via the matching `BRAIN_ROOT_*` environment variable
 * (e.g. BRAIN_ROOT_VAV=/checkout/vav) so CI can relocate checkouts.
 */
export const REPO_ROOTS = {
  vav: process.env.BRAIN_ROOT_VAV ?? "/Users/tomas/VZ_Tourism_Project",
  // Prefer the active TOURISM clone (Overlord + WA work). Override with
  // BRAIN_ROOT_CANEY if CI checks out tour-pms-main instead.
  caney: process.env.BRAIN_ROOT_CANEY ?? "/Users/tomas/--TOURISM--",
  crm: process.env.BRAIN_ROOT_CRM ?? "/Users/tomas/AGB-CRM",
  restaurants:
    process.env.BRAIN_ROOT_RESTAURANTS ?? "/Users/tomas/caneycloud-restaurant",
  academyCurriculum:
    process.env.BRAIN_ROOT_ACADEMY_CURRICULUM ??
    "/Users/tomas/vz-avitourism-curriculum",
  overlordWiki:
    process.env.BRAIN_ROOT_OVERLORD_WIKI ??
    "/Users/tomas/--TOURISM--/005- WIKI/operation-overlord",
};

/**
 * Contract-diff strictness policy (OQ-2). Read by contract-hasher.mjs's
 * diffContract(prevHash, curHash, removedFields, consumers, policy).
 *   - "typed-field-red" (DEFAULT, locked 2026-06-21): warn on contract-file
 *     hash change; escalate to red only when a typed field referenced by a
 *     known consumer call-site is removed.
 *   - "hash-warn": any contract-file hash change → health "warn".
 * v0 implements the interface only; hashing stays OFF (contract_hash: null).
 */
export const CONTRACT_DIFF_POLICY =
  process.env.BRAIN_CONTRACT_DIFF_POLICY ?? "typed-field-red";

/**
 * Cross-repo read credentials (OQ-4).
 *
 * v0 reads only local clones, so every value is null in practice. For the v1
 * CI-wired regen, least-privilege READ-ONLY tokens are injected from GitHub
 * Actions repo/org secrets at regen time.
 *
 * INVARIANT (NFR-SEC-4): this object is NEVER serialized into brain-graph.json.
 * Read from process.env only; do not hard-code secrets here.
 *
 * // TODO OQ-4: wire these to GitHub Actions secrets for v1 CI regen.
 */
export const CREDS = {
  vavServiceRole: process.env.BRAIN_VAV_SUPABASE_KEY ?? null,
  caneyServiceRole: process.env.BRAIN_CANEY_SUPABASE_KEY ?? null,
  crmServiceRole: process.env.BRAIN_CRM_SUPABASE_KEY ?? null,
  githubToken: process.env.BRAIN_GITHUB_TOKEN ?? null,
};

/**
 * The external dependencies referenced across the portfolio (HLR: "the 9").
 * Rendered as L0-only external chips; surfaced verbatim in brain-graph.json.
 */
export const EXTERNALS = [
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

/** Absolute output path for the generated artifact (imported statically by /brain). */
export const ARTIFACT_PATH = `${REPO_ROOTS.crm}/lib/brain/generated/brain-graph.json`;

/** Directory for timestamp-keyed snapshot copies (time-travel diffing). */
export const SNAPSHOT_DIR = `${REPO_ROOTS.crm}/lib/brain/generated/snapshots`;
