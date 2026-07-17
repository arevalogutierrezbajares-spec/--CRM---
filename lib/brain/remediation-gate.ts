/**
 * Soft remediation gate: warn if a proposed fix lacks Brain citations / tests.
 * Read-only; does not block — agents use as a pre-PR checklist.
 */

export type RemediationGateInput = {
  /** Free text: PR body, plan, or summary */
  text: string;
  /** Optional list of brain node ids the agent claims to have used */
  citedNodeIds?: string[];
  /** Whether tests were run (agent self-report) */
  testsRun?: boolean;
  /** Whether brain_search / rca_pack was used */
  brainToolsUsed?: boolean;
};

export type RemediationGateResult = {
  ok: true;
  pass: boolean;
  warnings: string[];
  suggestions: string[];
  score: number;
};

const NODE_ID_RE =
  /\b((?:vav|caney|crm|restaurants|academy)(?:\.[a-z0-9][a-z0-9._-]*)?|ix\d+|crm\.doc\.[a-z0-9.-]+)\b/gi;

export function remediationGate(input: RemediationGateInput): RemediationGateResult {
  const text = (input.text ?? "").trim();
  const warnings: string[] = [];
  const suggestions: string[] = [];
  let score = 100;

  const fromText = [...text.matchAll(NODE_ID_RE)].map((m) => m[1]);
  const cited = new Set([
    ...(input.citedNodeIds ?? []).map((s) => s.trim()).filter(Boolean),
    ...fromText,
  ]);

  if (cited.size === 0) {
    warnings.push("No Brain node ids cited (e.g. crm.capture, vav.booking, ix3).");
    suggestions.push("Run brain_search / brain_rca_pack and cite node ids in the PR body.");
    score -= 40;
  }

  if (!/\bdocs\//i.test(text) && ![...cited].some((c) => c.includes(".doc."))) {
    warnings.push("No documentation path or doc node cited.");
    suggestions.push("Link a runbook/ADR via brain_doc_get (docs/...).");
    score -= 15;
  }

  const testsMentioned =
    input.testsRun === true ||
    /\b(vitest|pnpm test|npm test|tests? passed|typecheck)\b/i.test(text);
  if (!testsMentioned) {
    warnings.push("No indication that tests were run.");
    suggestions.push("Run pnpm exec vitest / tsc and note results in the PR.");
    score -= 25;
  }

  if (input.brainToolsUsed === false) {
    warnings.push("Brain tools were not used before proposing a fix.");
    suggestions.push("Call brain_search then brain_neighborhood before editing.");
    score -= 20;
  }

  if (text.length < 40) {
    warnings.push("Remediation summary is very short — add hypothesis and scope.");
    score -= 10;
  }

  score = Math.max(0, score);
  return {
    ok: true,
    pass: warnings.length === 0,
    warnings,
    suggestions,
    score,
  };
}
