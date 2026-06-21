/**
 * THE BRAIN — contract hasher (FR-PIPE-5 / FR-PIPE-6).
 *
 * v0 INTERFACE ONLY. Hashing is OFF (every interchange ships contract_hash:null,
 * OQ-2). This module defines the diff interface the v1 typed-field differ will
 * implement behind the same signature, plus a stub differ. The orchestrator does
 * NOT invoke any of this in v0 — it exists so the seam is real and the policy
 * flag (config.CONTRACT_DIFF_POLICY, default "typed-field-red") has a home.
 */

import { CONTRACT_DIFF_POLICY } from "../config.mjs";

/**
 * @typedef {"ok"|"warn"|"red"} ContractDiffResult
 */

/**
 * Compare a previous vs current contract hash and decide the health escalation.
 *
 * Policy (OQ-2):
 *   - "hash-warn"        any hash change ⇒ "warn".
 *   - "typed-field-red"  hash change ⇒ "warn"; escalate to "red" only when a
 *                        typed field referenced by a known consumer call-site is
 *                        removed (needs the typed-field differ, v1).
 *
 * v0: never called (contract_hash null everywhere). Provided as the stable seam.
 *
 * @param {string|null} prevHash
 * @param {string|null} curHash
 * @param {string[]} removedFields   typed fields removed in the new contract
 * @param {string[]} consumers       known consumer call-sites referencing fields
 * @param {string} [policy]          defaults to config CONTRACT_DIFF_POLICY
 * @returns {ContractDiffResult}
 */
export function diffContract(
  prevHash,
  curHash,
  removedFields = [],
  consumers = [],
  policy = CONTRACT_DIFF_POLICY,
) {
  // No change → healthy.
  if (prevHash != null && curHash != null && prevHash === curHash) return "ok";
  // Either side missing a hash (v0 default) ⇒ undecidable ⇒ stay ok.
  if (prevHash == null || curHash == null) return "ok";

  if (policy === "hash-warn") return "warn";

  // typed-field-red: warn on any change; red only when a removed typed field is
  // referenced by a known consumer call-site.
  const breaksAConsumer = typedFieldDiffer(removedFields, consumers);
  return breaksAConsumer ? "red" : "warn";
}

/**
 * Typed-field differ STUB (v1). Returns true when any removed typed field is
 * referenced by a known consumer. v0 returns false (no typed-field index yet).
 *
 * @param {string[]} removedFields
 * @param {string[]} consumers
 * @returns {boolean}
 */
export function typedFieldDiffer(removedFields, consumers) {
  // TODO v1: build a typed-field index from the OpenAPI component schemas and
  // cross-reference consumer call-sites (grep for field access). Until then we
  // never escalate to red automatically.
  void removedFields;
  void consumers;
  return false;
}
