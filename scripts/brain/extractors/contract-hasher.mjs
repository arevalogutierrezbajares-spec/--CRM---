/**
 * THE BRAIN — contract hasher (FR-PIPE-5 / FR-PIPE-6).
 *
 * Hashes on-disk contract files for live interchanges and escalates health
 * when the hash changes vs the previously committed brain-graph.json.
 * Deterministic. No LLM.
 *
 * Policy (OQ-2):
 *   - "hash-warn"        any hash change ⇒ "warn".
 *   - "typed-field-red"  hash change ⇒ "warn"; escalate to "red" only when a
 *                        typed field referenced by a known consumer is removed
 *                        (typed-field index still stubbed).
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CONTRACT_DIFF_POLICY, REPO_ROOTS, ARTIFACT_PATH } from "../config.mjs";

/**
 * @typedef {"ok"|"warn"|"red"} ContractDiffResult
 */

/**
 * Compare a previous vs current contract hash and decide the health escalation.
 *
 * @param {string|null} prevHash
 * @param {string|null} curHash
 * @param {string[]} removedFields
 * @param {string[]} consumers
 * @param {string} [policy]
 * @returns {ContractDiffResult}
 */
export function diffContract(
  prevHash,
  curHash,
  removedFields = [],
  consumers = [],
  policy = CONTRACT_DIFF_POLICY,
) {
  if (prevHash != null && curHash != null && prevHash === curHash) return "ok";
  if (prevHash == null || curHash == null) return "ok";

  if (policy === "hash-warn") return "warn";

  const breaksAConsumer = typedFieldDiffer(removedFields, consumers);
  return breaksAConsumer ? "red" : "warn";
}

/**
 * Typed-field differ STUB. Returns true when a removed typed field is
 * referenced by a known consumer. Always false until the typed-field index lands.
 *
 * @param {string[]} removedFields
 * @param {string[]} consumers
 * @returns {boolean}
 */
export function typedFieldDiffer(removedFields, consumers) {
  void removedFields;
  void consumers;
  return false;
}

/** sha256 hex of file contents, or null if missing/unreadable. */
export function hashFile(absPath) {
  if (!absPath || !existsSync(absPath)) return null;
  try {
    const body = readFileSync(absPath);
    return createHash("sha256").update(body).digest("hex").slice(0, 16);
  } catch {
    return null;
  }
}

/**
 * Resolve a contract_ref string to an absolute path under REPO_ROOTS.
 * Accepts forms like:
 *   "AGB-CRM/lib/platforms/status.server.ts"
 *   "VZ_Tourism_Project/docs/pms-integration/05-api/openapi.yaml"
 *   "tour-pms-main/.../mcp_registry.py"
 *   relative paths already under a known root
 */
export function resolveContractPath(contractRef) {
  if (!contractRef) return null;
  const ref = String(contractRef).replace(/\\/g, "/");

  const PREFIX = [
    { re: /^(AGB-CRM|agb-crm)\//i, root: REPO_ROOTS.crm },
    { re: /^(VZ_Tourism_Project|vav)\//i, root: REPO_ROOTS.vav },
    { re: /^(tour-pms-main|caney|cloud-pms-main)\//i, root: REPO_ROOTS.caney },
    { re: /^(caneycloud-restaurant|restaurants)\//i, root: REPO_ROOTS.restaurants },
  ];

  for (const { re, root } of PREFIX) {
    if (!root) continue;
    const m = ref.match(re);
    if (m) {
      const rest = ref.slice(m[0].length);
      // Collapse "…/APP/backend/mcp_registry.py" style globs
      if (rest.includes("...")) {
        // Known special-case: Caney MCP registry
        if (rest.includes("mcp_registry")) {
          return join(root, "APP/backend/mcp_registry.py");
        }
        return null;
      }
      return join(root, rest);
    }
  }

  // Bare relative path under CRM
  if (REPO_ROOTS.crm && existsSync(join(REPO_ROOTS.crm, ref))) {
    return join(REPO_ROOTS.crm, ref);
  }
  return null;
}

/** Load previous contract hashes from the committed artifact (if present). */
export function loadPreviousHashes(artifactPath = ARTIFACT_PATH) {
  /** @type {Record<string, string|null>} */
  const out = {};
  if (!existsSync(artifactPath)) return out;
  try {
    const g = JSON.parse(readFileSync(artifactPath, "utf8"));
    for (const e of g.edges ?? []) {
      if (e.kind === "interchange" && e.id) {
        out[e.id] = e.contract_hash ?? null;
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

/**
 * Apply hashes + health escalation onto interchange edges (mutates in place).
 * Planned edges keep contract_hash null and are excluded from breakage.
 *
 * @param {Array<Record<string, unknown>>} edges
 * @returns {{ hashed: number, warned: number }}
 */
export function applyContractHashes(edges) {
  const prev = loadPreviousHashes();
  let hashed = 0;
  let warned = 0;

  for (const e of edges) {
    if (e.kind !== "interchange") continue;
    if (e.contract_status === "planned") {
      e.contract_hash = null;
      continue;
    }

    const abs = resolveContractPath(e.contract_ref);
    const cur = hashFile(abs);
    e.contract_hash = cur;
    if (cur) hashed++;

    const prevHash = prev[e.id] ?? null;
    const result = diffContract(prevHash, cur);
    if (result === "warn" || result === "red") {
      // Don't downgrade an existing structural "dark" / "warn" from detectors
      // unless we have a stronger signal.
      if (e.health === "ok" || e.health == null) {
        e.health = result === "red" ? "warn" : "warn";
      }
      const note = `contract changed (${prevHash ?? "∅"} → ${cur ?? "∅"})`;
      const breaks = Array.isArray(e.breaks) ? e.breaks : [];
      if (!breaks.some((b) => String(b).includes("contract changed"))) {
        e.breaks = [note, ...breaks];
      }
      warned++;
    }
  }

  return { hashed, warned };
}
