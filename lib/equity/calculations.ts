import type {
  DeliverableStatus,
  EquityAdvisorResult,
  EquityDecisionSignal,
  EquityOverview,
  EquityPool,
  EquityProposal,
  EquityRoleBand,
  EquityScenarioInput,
  EquityStakeholder,
  VestingSchedule,
} from "@/lib/equity/types";

const COMPLETE_VALUE: Record<DeliverableStatus, number> = {
  not_started: 0,
  blocked: 0,
  at_risk: 0.25,
  in_progress: 0.5,
  complete: 1,
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatBps(bps: number): string {
  const pct = bps / 100;
  const digits = pct >= 10 || Number.isInteger(pct) ? 0 : 2;
  return `${pct.toFixed(digits)}%`;
}

export function formatShares(shares: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(shares);
}

export function bpsToShares(bps: number, fullyDilutedShares: number): number {
  return Math.round((bps / 10_000) * fullyDilutedShares);
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

export function addMonths(dateValue: string, months: number): string {
  const date = parseDate(dateValue);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

export function monthsElapsed(startValue: string, asOfValue: string): number {
  const start = parseDate(startValue);
  const asOf = parseDate(asOfValue);
  if (asOf <= start) return 0;

  const wholeMonths =
    (asOf.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (asOf.getUTCMonth() - start.getUTCMonth());
  const dayDelta = asOf.getUTCDate() - start.getUTCDate();
  const daysInAsOfMonth = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 0),
  ).getUTCDate();

  return Math.max(0, wholeMonths + dayDelta / daysInAsOfMonth);
}

export function vestedBps(
  totalBps: number,
  schedule: VestingSchedule,
  asOfDate: string,
): number {
  if (schedule.cadence === "milestone") return 0;

  const elapsed = monthsElapsed(schedule.startDate, asOfDate);
  if (elapsed < schedule.cliffMonths) return 0;
  if (elapsed >= schedule.durationMonths) return totalBps;

  return Math.round((totalBps * elapsed) / schedule.durationMonths);
}

export function deliverableCompletionPct(
  deliverables: { status: DeliverableStatus; weight: number }[],
): number {
  const totalWeight = deliverables.reduce((sum, d) => sum + d.weight, 0);
  if (totalWeight <= 0) return 0;
  const completed = deliverables.reduce(
    (sum, d) => sum + d.weight * COMPLETE_VALUE[d.status],
    0,
  );
  return Math.round((completed / totalWeight) * 100);
}

export function countAtRiskDeliverables(
  deliverables: { status: DeliverableStatus }[],
): number {
  return deliverables.filter(
    (d) => d.status === "at_risk" || d.status === "blocked",
  ).length;
}

export function buildEquityOverview(opts: {
  pool: EquityPool;
  stakeholders: EquityStakeholder[];
  proposals: EquityProposal[];
  asOfDate: string;
}): EquityOverview {
  const grantedBps = opts.stakeholders
    .filter((s) => s.status !== "terminated")
    .reduce((sum, s) => sum + s.ownershipBps, 0);

  const vestedNow = opts.stakeholders.reduce(
    (sum, s) => sum + vestedBps(s.ownershipBps, s.vesting, opts.asOfDate),
    0,
  );

  const pendingBps = opts.proposals
    .filter((p) => p.stage === "draft" || p.stage === "needs_review")
    .reduce((sum, p) => sum + p.proposedBps, 0);

  const allDeliverables = [
    ...opts.stakeholders.flatMap((s) => s.deliverables),
    ...opts.proposals.flatMap((p) => p.deliverables),
  ];

  return {
    grantedBps,
    vestedBps: vestedNow,
    pendingBps,
    availableEmployeePoolBps: Math.max(
      0,
      opts.pool.employeePoolBps - grantedBps - pendingBps,
    ),
    availableAdvisorPoolBps: Math.max(
      0,
      opts.pool.advisorPoolBps -
        opts.stakeholders
          .filter((s) => s.grantType === "stock_option")
          .reduce((sum, s) => sum + Math.min(s.ownershipBps, 25), 0),
    ),
    deliverableCompletionPct: deliverableCompletionPct(allDeliverables),
    atRiskDeliverables: countAtRiskDeliverables(allDeliverables),
  };
}

export function scoreScenario(
  scenario: EquityScenarioInput,
  roleBand: EquityRoleBand,
): number {
  const midpoint = (roleBand.benchmarkLowBps + roleBand.benchmarkHighBps) / 2;
  const overBenchmark = Math.max(0, scenario.proposedBps - roleBand.benchmarkHighBps);
  const underBenchmark = Math.max(0, roleBand.benchmarkLowBps - scenario.proposedBps);

  let score = 72;
  score += scenario.proposedBps <= midpoint ? 8 : 0;
  score -= Math.round((overBenchmark / Math.max(roleBand.benchmarkHighBps, 1)) * 28);
  score -= Math.round((underBenchmark / Math.max(roleBand.benchmarkLowBps, 1)) * 10);
  score += Math.min(10, scenario.deliverableCount * 2);
  score += Math.min(8, scenario.criticalDeliverables * 3);
  score += scenario.vestingMonths >= 48 ? 8 : -6;
  score += scenario.cliffMonths >= 12 ? 4 : -5;

  return clamp(score, 0, 100);
}

export function scenarioDecision(score: number): EquityAdvisorResult["decision"] {
  if (score >= 82) return "approve";
  if (score >= 58) return "revise";
  return "hold";
}

export function buildDeterministicAdvisor(opts: {
  scenario: EquityScenarioInput;
  roleBand: EquityRoleBand;
  availablePoolBps: number;
}): EquityAdvisorResult {
  const score = scoreScenario(opts.scenario, opts.roleBand);
  const decision = scenarioDecision(score);
  const overHigh = opts.scenario.proposedBps - opts.roleBand.benchmarkHighBps;
  const poolAfter = opts.availablePoolBps - opts.scenario.proposedBps;

  const risks: string[] = [];
  if (overHigh > 0) {
    risks.push(
      `Proposed grant is ${formatBps(overHigh)} above the role band ceiling.`,
    );
  }
  if (poolAfter < 200) {
    risks.push("Employee pool drops below the 2% operating reserve.");
  }
  if (opts.scenario.criticalDeliverables < 2) {
    risks.push("Add at least two measurable deliverables before issuing paper.");
  }
  if (opts.scenario.cliffMonths < 12) {
    risks.push("Cliff is shorter than the default governance standard.");
  }

  return {
    mode: "deterministic",
    decision,
    confidence: score,
    headline:
      decision === "approve"
        ? "Approve with founder sign-off and standard vesting."
        : decision === "revise"
          ? "Revise terms before sending the offer."
          : "Hold until role scope and delivery gates are tighter.",
    rationale:
      "This read compares the proposed grant against role benchmarks, vesting discipline, deliverable coverage, and remaining pool capacity.",
    suggestedTerms: [
      `${formatBps(opts.scenario.proposedBps)} ${opts.roleBand.label} grant`,
      `${opts.scenario.vestingMonths}-month vesting with ${opts.scenario.cliffMonths}-month cliff`,
      "Quarterly founder review tied to CRM deliverable evidence",
    ],
    risks:
      risks.length > 0
        ? risks
        : ["No major structural issue detected in the current scenario."],
    questions: [
      "What specific business outcome must be true before the first tranche vests?",
      "Who verifies completion and where is the evidence stored in the CRM?",
      "What happens to unvested equity if the role scope changes?",
    ],
  };
}

export function buildDecisionSignals(opts: {
  overview: EquityOverview;
  proposals: EquityProposal[];
  stakeholders: EquityStakeholder[];
}): EquityDecisionSignal[] {
  const signals: EquityDecisionSignal[] = [];

  if (opts.overview.availableEmployeePoolBps < 250) {
    signals.push({
      id: "pool-reserve",
      tone: "risk",
      title: "Pool reserve tightening",
      detail: `${formatBps(opts.overview.availableEmployeePoolBps)} remains after pending offers.`,
      action: "Reprice or tranche new offers before approval.",
    });
  }

  if (opts.overview.atRiskDeliverables > 0) {
    signals.push({
      id: "deliverables-at-risk",
      tone: "watch",
      title: "Deliverables need review",
      detail: `${opts.overview.atRiskDeliverables} deliverable gates are blocked or at risk.`,
      action: "Open recipient reviews and attach evidence.",
    });
  }

  const staleReviews = opts.stakeholders.filter((s) => {
    const next = parseDate(s.nextReviewDate);
    return next < new Date();
  });
  if (staleReviews.length > 0) {
    signals.push({
      id: "stale-reviews",
      tone: "risk",
      title: "Reviews overdue",
      detail: `${staleReviews.length} equity recipient review${staleReviews.length === 1 ? "" : "s"} past due.`,
      action: "Schedule founder review before issuing new equity.",
    });
  }

  const needsApproval = opts.proposals.filter((p) => p.stage === "needs_review");
  if (needsApproval.length > 0) {
    signals.push({
      id: "proposal-approval",
      tone: "good",
      title: "Offer packet ready",
      detail: `${needsApproval.length} proposal${needsApproval.length === 1 ? "" : "s"} ready for decision.`,
      action: "Run advisor read and send to counsel.",
    });
  }

  return signals.slice(0, 4);
}
