export type EquityGrantType =
  | "founder_stock"
  | "restricted_stock"
  | "stock_option"
  | "rsa"
  | "phantom"
  | "token";

export type EquityStatus =
  | "active"
  | "proposed"
  | "vesting_paused"
  | "exercised"
  | "terminated";

export type DeliverableStatus =
  | "not_started"
  | "in_progress"
  | "at_risk"
  | "blocked"
  | "complete";

export type ReviewTone = "good" | "watch" | "risk";

export type EquityRoleBand = {
  id: string;
  label: string;
  benchmarkLowBps: number;
  benchmarkHighBps: number;
  defaultBps: number;
  defaultVestingMonths: number;
  defaultCliffMonths: number;
  recommendedDeliverables: string[];
};

export type VestingSchedule = {
  startDate: string;
  cliffMonths: number;
  durationMonths: number;
  cadence: "monthly" | "quarterly" | "milestone";
};

export type EquityDeliverable = {
  id: string;
  title: string;
  owner: string;
  status: DeliverableStatus;
  dueDate: string;
  weight: number;
  verification: string;
  roleImpact: "core" | "supporting" | "advisory";
};

export type EquityStakeholder = {
  id: string;
  name: string;
  role: string;
  team: string;
  grantType: EquityGrantType;
  status: EquityStatus;
  ownershipBps: number;
  vesting: VestingSchedule;
  deliverables: EquityDeliverable[];
  accessLevel: "founder" | "reviewer" | "recipient" | "viewer";
  lastReviewDate: string;
  nextReviewDate: string;
  notes: string;
};

export type EquityProposal = {
  id: string;
  candidateName: string;
  roleBandId: string;
  roleTitle: string;
  proposedBps: number;
  grantType: EquityGrantType;
  vesting: VestingSchedule;
  deliverables: EquityDeliverable[];
  stage: "draft" | "needs_review" | "approved" | "sent";
  rationale: string;
};

export type EquityPool = {
  fullyDilutedShares: number;
  founderAllocatedBps: number;
  employeePoolBps: number;
  advisorPoolBps: number;
  strategicReserveBps: number;
};

export type EquityDecisionSignal = {
  id: string;
  tone: ReviewTone;
  title: string;
  detail: string;
  action: string;
};

export type EquityAdvisorResult = {
  mode: "ai" | "deterministic";
  decision: "approve" | "revise" | "hold";
  confidence: number;
  headline: string;
  rationale: string;
  suggestedTerms: string[];
  risks: string[];
  questions: string[];
};

export type EquityScenarioInput = {
  roleBandId: string;
  proposedBps: number;
  vestingMonths: number;
  cliffMonths: number;
  deliverableCount: number;
  criticalDeliverables: number;
};

export type EquityOverview = {
  grantedBps: number;
  vestedBps: number;
  pendingBps: number;
  availableEmployeePoolBps: number;
  availableAdvisorPoolBps: number;
  deliverableCompletionPct: number;
  atRiskDeliverables: number;
};
