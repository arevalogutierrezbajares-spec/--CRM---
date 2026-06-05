"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Gauge,
  LockKeyhole,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import { cn, formatDate } from "@/lib/utils";
import {
  bpsToShares,
  buildDecisionSignals,
  buildDeterministicAdvisor,
  buildEquityOverview,
  deliverableCompletionPct,
  formatBps,
  formatShares,
  scoreScenario,
  vestedBps,
} from "@/lib/equity/calculations";
import {
  EQUITY_AS_OF_DATE,
  EQUITY_POOL,
  EQUITY_PROPOSALS,
  EQUITY_ROLE_BANDS,
  EQUITY_STAKEHOLDERS,
} from "@/lib/equity/demo-data";
import type {
  DeliverableStatus,
  EquityAdvisorResult,
  EquityDecisionSignal,
  EquityScenarioInput,
  EquityStakeholder,
  ReviewTone,
} from "@/lib/equity/types";

const STATUS_LABEL: Record<DeliverableStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  at_risk: "At risk",
  blocked: "Blocked",
  complete: "Complete",
};

const STATUS_BADGE: Record<DeliverableStatus, "secondary" | "success" | "warning" | "danger"> = {
  not_started: "secondary",
  in_progress: "warning",
  at_risk: "warning",
  blocked: "danger",
  complete: "success",
};

const TONE_BADGE: Record<ReviewTone, "success" | "warning" | "danger"> = {
  good: "success",
  watch: "warning",
  risk: "danger",
};

const DECISION_BADGE: Record<EquityAdvisorResult["decision"], "success" | "warning" | "danger"> = {
  approve: "success",
  revise: "warning",
  hold: "danger",
};

export function EquityCommandCenter({ founderName }: { founderName: string }) {
  const overview = useMemo(
    () =>
      buildEquityOverview({
        pool: EQUITY_POOL,
        stakeholders: EQUITY_STAKEHOLDERS,
        proposals: EQUITY_PROPOSALS,
        asOfDate: EQUITY_AS_OF_DATE,
      }),
    [],
  );

  const [roleBandId, setRoleBandId] = useState(EQUITY_PROPOSALS[0].roleBandId);
  const roleBand = useMemo(
    () => EQUITY_ROLE_BANDS.find((r) => r.id === roleBandId) ?? EQUITY_ROLE_BANDS[0],
    [roleBandId],
  );
  const [proposedBps, setProposedBps] = useState(roleBand.defaultBps);
  const [vestingMonths, setVestingMonths] = useState(roleBand.defaultVestingMonths);
  const [cliffMonths, setCliffMonths] = useState(roleBand.defaultCliffMonths);
  const [deliverableCount, setDeliverableCount] = useState(3);
  const [criticalDeliverables, setCriticalDeliverables] = useState(2);
  const [aiAdvisor, setAiAdvisor] = useState<EquityAdvisorResult | null>(null);
  const [loadingAdvisor, setLoadingAdvisor] = useState(false);
  const [advisorError, setAdvisorError] = useState<string | null>(null);

  const scenario: EquityScenarioInput = useMemo(
    () => ({
      roleBandId,
      proposedBps,
      vestingMonths,
      cliffMonths,
      deliverableCount,
      criticalDeliverables,
    }),
    [
      roleBandId,
      proposedBps,
      vestingMonths,
      cliffMonths,
      deliverableCount,
      criticalDeliverables,
    ],
  );

  const deterministicAdvisor = useMemo(
    () =>
      buildDeterministicAdvisor({
        scenario,
        roleBand,
        availablePoolBps: overview.availableEmployeePoolBps,
      }),
    [scenario, roleBand, overview.availableEmployeePoolBps],
  );
  const advisor = aiAdvisor ?? deterministicAdvisor;

  const projectedPoolAfter = overview.availableEmployeePoolBps - proposedBps;
  const score = scoreScenario(scenario, roleBand);
  const signals = buildDecisionSignals({
    overview,
    proposals: EQUITY_PROPOSALS,
    stakeholders: EQUITY_STAKEHOLDERS,
  });

  async function runAdvisor() {
    setLoadingAdvisor(true);
    setAdvisorError(null);
    try {
      const resp = await fetch("/api/equity/advisor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...scenario,
          availablePoolBps: overview.availableEmployeePoolBps,
        }),
      });
      if (!resp.ok) throw new Error(`Advisor failed with ${resp.status}`);
      const json = (await resp.json()) as { advisor?: EquityAdvisorResult };
      if (!json.advisor) throw new Error("Advisor returned no result");
      setAiAdvisor(json.advisor);
    } catch {
      setAdvisorError("AI read unavailable. Showing deterministic governance read.");
    } finally {
      setLoadingAdvisor(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 py-5 sm:px-6 sm:py-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-tiny">
              Founder view
            </Badge>
            <Badge variant="secondary" className="text-tiny">
              As of {formatDate(EQUITY_AS_OF_DATE)}
            </Badge>
          </div>
          <h1 className="text-[22px] font-medium tracking-tight text-text-primary">
            Equity OS
          </h1>
          <p className="max-w-3xl text-[13px] leading-5 text-text-secondary">
            Equity structure, vesting, deliverables, recipient reviews, and offer decisions
            in one operating view for {founderName}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={runAdvisor} loading={loadingAdvisor}>
            <Bot className="h-4 w-4" />
            Run AI advisor
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <a href="#proposal-simulator">
              <SlidersHorizontal className="h-4 w-4" />
              Simulate offer
            </a>
          </Button>
        </div>
      </header>

      <section className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={Scale}
          label="Granted"
          value={formatBps(overview.grantedBps)}
          detail={`${formatShares(bpsToShares(overview.grantedBps, EQUITY_POOL.fullyDilutedShares))} fully diluted shares`}
        />
        <Metric
          icon={Wallet}
          label="Employee pool available"
          value={formatBps(overview.availableEmployeePoolBps)}
          detail={`${formatBps(overview.pendingBps)} pending in active offers`}
        />
        <Metric
          icon={CalendarClock}
          label="Vested today"
          value={formatBps(overview.vestedBps)}
          detail="Based on active schedules and cliff rules"
        />
        <Metric
          icon={ClipboardCheck}
          label="Deliverable health"
          value={`${overview.deliverableCompletionPct}%`}
          detail={`${overview.atRiskDeliverables} gate${overview.atRiskDeliverables === 1 ? "" : "s"} need attention`}
        />
      </section>

      <section className="grid gap-2.5 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <DashCard>
          <SectionLabel icon={Bot} right={<Badge variant={advisor.mode === "ai" ? "success" : "secondary"}>{advisor.mode === "ai" ? "AI" : "Rules"}</Badge>}>
            Decision board
          </SectionLabel>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={DECISION_BADGE[advisor.decision]}>
                  {advisor.decision.toUpperCase()}
                </Badge>
                <span className="text-[12px] tabular-nums text-text-secondary">
                  {advisor.confidence}/100 confidence
                </span>
              </div>
              <h2 className="mt-2 text-[18px] font-medium tracking-tight text-text-primary">
                {advisor.headline}
              </h2>
              <p className="mt-1 text-[13px] leading-5 text-text-secondary">
                {advisor.rationale}
              </p>
              {advisorError && (
                <p className="mt-2 text-[12px] text-amber-text">{advisorError}</p>
              )}
            </div>
            <div className="grid min-w-[260px] gap-2 text-[12px] sm:grid-cols-3 lg:grid-cols-1">
              <MiniReadout label="Scenario score" value={`${score}/100`} />
              <MiniReadout label="Pool after offer" value={formatBps(projectedPoolAfter)} tone={projectedPoolAfter < 200 ? "risk" : "good"} />
              <MiniReadout label="Role band" value={`${formatBps(roleBand.benchmarkLowBps)}-${formatBps(roleBand.benchmarkHighBps)}`} />
            </div>
          </div>
          <div className="mt-3 grid gap-2.5 md:grid-cols-3">
            <ListBlock title="Suggested terms" items={advisor.suggestedTerms} />
            <ListBlock title="Risks" items={advisor.risks} tone="risk" />
            <ListBlock title="Questions" items={advisor.questions} />
          </div>
        </DashCard>

        <DashCard>
          <SectionLabel icon={Gauge}>Action queue</SectionLabel>
          <div className="space-y-2">
            {signals.map((signal) => (
              <SignalRow key={signal.id} signal={signal} />
            ))}
          </div>
        </DashCard>
      </section>

      <section id="proposal-simulator" className="grid gap-2.5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <DashCard>
          <SectionLabel icon={SlidersHorizontal}>Offer simulator</SectionLabel>
          <div className="space-y-3">
            <label className="block">
              <span className="text-[12px] font-medium text-text-primary">Role band</span>
              <select
                value={roleBandId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  const nextBand =
                    EQUITY_ROLE_BANDS.find((band) => band.id === nextId) ??
                    EQUITY_ROLE_BANDS[0];
                  setRoleBandId(nextId);
                  setProposedBps(nextBand.defaultBps);
                  setVestingMonths(nextBand.defaultVestingMonths);
                  setCliffMonths(nextBand.defaultCliffMonths);
                  setAiAdvisor(null);
                  setAdvisorError(null);
                }}
                className="mt-1 h-10 w-full rounded-md border border-[var(--border)] bg-background px-3 text-[13px] text-text-primary outline-none focus:ring-2 focus:ring-[var(--ring)]"
              >
                {EQUITY_ROLE_BANDS.map((band) => (
                  <option key={band.id} value={band.id}>
                    {band.label}
                  </option>
                ))}
              </select>
            </label>
            <SliderField
              label="Proposed grant"
              value={proposedBps}
              min={5}
              max={900}
              step={5}
              renderValue={formatBps}
              onChange={(value) => {
                setProposedBps(value);
                setAiAdvisor(null);
                setAdvisorError(null);
              }}
            />
            <SliderField
              label="Vesting duration"
              value={vestingMonths}
              min={12}
              max={72}
              step={6}
              renderValue={(v) => `${v} months`}
              onChange={(value) => {
                setVestingMonths(value);
                setAiAdvisor(null);
                setAdvisorError(null);
              }}
            />
            <SliderField
              label="Cliff"
              value={cliffMonths}
              min={0}
              max={24}
              step={3}
              renderValue={(v) => `${v} months`}
              onChange={(value) => {
                setCliffMonths(value);
                setAiAdvisor(null);
                setAdvisorError(null);
              }}
            />
            <div className="grid grid-cols-2 gap-2">
              <StepperField
                label="Deliverables"
                value={deliverableCount}
                min={0}
                max={12}
                onChange={(value) => {
                  setDeliverableCount(value);
                  setAiAdvisor(null);
                  setAdvisorError(null);
                }}
              />
              <StepperField
                label="Critical gates"
                value={criticalDeliverables}
                min={0}
                max={8}
                onChange={(value) => {
                  setCriticalDeliverables(value);
                  setAiAdvisor(null);
                  setAdvisorError(null);
                }}
              />
            </div>
            <div className="rounded-md bg-surface p-2.5 text-[12px] text-text-secondary">
              <div className="font-medium text-text-primary">Recommended gates</div>
              <ul className="mt-1 space-y-1">
                {roleBand.recommendedDeliverables.map((item) => (
                  <li key={item} className="flex gap-1.5">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-text" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </DashCard>

        <DashCard>
          <SectionLabel icon={UsersRound}>Equity structure</SectionLabel>
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-[12.5px]">
              <thead>
                <tr className="text-tiny uppercase tracking-wider text-text-tertiary">
                  <th className="pb-2 text-left font-medium">Recipient</th>
                  <th className="pb-2 text-left font-medium">Role</th>
                  <th className="pb-2 text-right font-medium">Grant</th>
                  <th className="pb-2 text-right font-medium">Vested</th>
                  <th className="pb-2 text-right font-medium">Deliverables</th>
                  <th className="pb-2 text-left font-medium">Next review</th>
                  <th className="pb-2 text-left font-medium">Access</th>
                </tr>
              </thead>
              <tbody>
                {EQUITY_STAKEHOLDERS.map((stakeholder) => (
                  <StakeholderRow key={stakeholder.id} stakeholder={stakeholder} />
                ))}
                {EQUITY_PROPOSALS.map((proposal) => (
                  <tr
                    key={proposal.id}
                    className="border-t"
                    style={{ borderColor: "var(--border-default)" }}
                  >
                    <td className="py-2 pr-3">
                      <div className="font-medium text-text-primary">{proposal.candidateName}</div>
                      <div className="text-tiny text-text-tertiary">Proposal</div>
                    </td>
                    <td className="py-2 pr-3 text-text-secondary">{proposal.roleTitle}</td>
                    <td className="py-2 text-right tabular-nums font-medium text-text-primary">
                      {formatBps(proposal.proposedBps)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-text-tertiary">Pending</td>
                    <td className="py-2 text-right tabular-nums text-text-secondary">
                      {proposal.deliverables.length} gates
                    </td>
                    <td className="py-2 text-text-secondary">Founder review</td>
                    <td className="py-2">
                      <Badge variant="warning">Needs review</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DashCard>
      </section>

      <section className="grid gap-2.5 lg:grid-cols-2">
        <DashCard>
          <SectionLabel icon={FileCheck2}>Vesting vs deliverables</SectionLabel>
          <div className="space-y-3">
            {EQUITY_STAKEHOLDERS.map((stakeholder) => (
              <VestingLane key={stakeholder.id} stakeholder={stakeholder} />
            ))}
          </div>
        </DashCard>

        <DashCard>
          <SectionLabel icon={LockKeyhole}>Governance and access</SectionLabel>
          <div className="grid gap-2 sm:grid-cols-2">
            <GovernanceItem
              title="Founder approval"
              detail="Every offer requires founder review before docs leave the CRM."
              status="Ready"
              tone="good"
            />
            <GovernanceItem
              title="Counsel packet"
              detail="Term sheet, vesting schedule, deliverable gates, and board notes."
              status="Draft"
              tone="watch"
            />
            <GovernanceItem
              title="Recipient access"
              detail="Recipients see only their offer, vesting, and accepted deliverables."
              status="Scoped"
              tone="good"
            />
            <GovernanceItem
              title="Quarterly audit"
              detail="Review stale grants, paused vesting, and milestone evidence."
              status="Due soon"
              tone="watch"
            />
          </div>
          <div className="mt-3 rounded-md border border-[var(--border)] bg-surface p-2.5">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-text" />
              <p className="text-[12px] leading-5 text-text-secondary">
                AI output is a decision-support read only. Final equity terms still need
                founder approval, company policy, and legal/tax review before issuance.
              </p>
            </div>
          </div>
        </DashCard>
      </section>
    </main>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <DashCard>
      <SectionLabel icon={Icon}>{label}</SectionLabel>
      <div className="text-[26px] font-medium leading-none tabular-nums text-text-primary">
        {value}
      </div>
      <p className="mt-2 text-[12px] leading-4 text-text-secondary">{detail}</p>
    </DashCard>
  );
}

function MiniReadout({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "risk";
}) {
  return (
    <div className="rounded-md bg-surface p-2.5">
      <div className="text-tiny uppercase tracking-wider text-text-tertiary">{label}</div>
      <div
        className={cn(
          "mt-1 text-[17px] font-medium tabular-nums",
          tone === "good" && "text-green-text",
          tone === "risk" && "text-red-text",
          tone === "neutral" && "text-text-primary",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ListBlock({
  title,
  items,
  tone = "neutral",
}: {
  title: string;
  items: string[];
  tone?: "neutral" | "risk";
}) {
  return (
    <div className="rounded-md bg-surface p-2.5">
      <div className="text-tiny font-medium uppercase tracking-wider text-text-tertiary">
        {title}
      </div>
      <ul className="mt-2 space-y-1.5 text-[12px] leading-4 text-text-secondary">
        {items.map((item) => (
          <li key={item} className="flex gap-1.5">
            {tone === "risk" ? (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-text" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-text" />
            )}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SignalRow({ signal }: { signal: EquityDecisionSignal }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-surface p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 gap-2">
          <SignalToneIcon tone={signal.tone} />
          <div className="min-w-0">
            <div className="text-[12.5px] font-medium text-text-primary">{signal.title}</div>
            <div className="mt-0.5 text-[12px] leading-4 text-text-secondary">
              {signal.detail}
            </div>
          </div>
        </div>
        <Badge variant={TONE_BADGE[signal.tone]} className="shrink-0">
          {signal.tone}
        </Badge>
      </div>
      <div className="mt-2 text-[12px] text-text-primary">{signal.action}</div>
    </div>
  );
}

function SignalToneIcon({ tone }: { tone: ReviewTone }) {
  if (tone === "good") {
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />;
  }
  if (tone === "watch") {
    return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />;
  }
  return <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />;
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  renderValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  renderValue: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-text-primary">{label}</span>
        <span className="text-[12px] tabular-nums text-text-secondary">
          {renderValue(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-10 w-full accent-[var(--primary)]"
      />
    </label>
  );
}

function StepperField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[12px] font-medium text-text-primary">{label}</div>
      <div className="flex h-10 items-center rounded-md border border-[var(--border)] bg-background">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="h-full w-10 rounded-l-md text-text-secondary transition-colors hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          -
        </button>
        <div className="min-w-0 flex-1 text-center text-[13px] tabular-nums text-text-primary">
          {value}
        </div>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="h-full w-10 rounded-r-md text-text-secondary transition-colors hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          +
        </button>
      </div>
    </div>
  );
}

function StakeholderRow({ stakeholder }: { stakeholder: EquityStakeholder }) {
  const progress = deliverableCompletionPct(stakeholder.deliverables);
  const vested = vestedBps(
    stakeholder.ownershipBps,
    stakeholder.vesting,
    EQUITY_AS_OF_DATE,
  );

  return (
    <tr className="border-t" style={{ borderColor: "var(--border-default)" }}>
      <td className="py-2 pr-3">
        <div className="font-medium text-text-primary">{stakeholder.name}</div>
        <div className="text-tiny text-text-tertiary">{stakeholder.team}</div>
      </td>
      <td className="py-2 pr-3 text-text-secondary">{stakeholder.role}</td>
      <td className="py-2 text-right tabular-nums font-medium text-text-primary">
        {formatBps(stakeholder.ownershipBps)}
      </td>
      <td className="py-2 text-right tabular-nums text-text-secondary">
        {formatBps(vested)}
      </td>
      <td className="py-2 text-right">
        <span className="tabular-nums text-text-primary">{progress}%</span>
      </td>
      <td className="py-2 text-text-secondary">{formatDate(stakeholder.nextReviewDate)}</td>
      <td className="py-2">
        <Badge variant={stakeholder.status === "vesting_paused" ? "warning" : "success"}>
          {stakeholder.status === "vesting_paused" ? "Paused" : stakeholder.accessLevel}
        </Badge>
      </td>
    </tr>
  );
}

function VestingLane({ stakeholder }: { stakeholder: EquityStakeholder }) {
  const vested = vestedBps(
    stakeholder.ownershipBps,
    stakeholder.vesting,
    EQUITY_AS_OF_DATE,
  );
  const vestingPct =
    stakeholder.ownershipBps === 0
      ? 0
      : Math.round((vested / stakeholder.ownershipBps) * 100);
  const deliverablePct = deliverableCompletionPct(stakeholder.deliverables);

  return (
    <div className="rounded-md border border-[var(--border)] bg-surface p-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-medium text-text-primary">{stakeholder.name}</div>
          <div className="text-[12px] text-text-secondary">{stakeholder.role}</div>
        </div>
        <Badge variant={stakeholder.status === "vesting_paused" ? "warning" : "secondary"}>
          {stakeholder.status.replace("_", " ")}
        </Badge>
      </div>
      <ProgressRow label="Vesting" value={vestingPct} detail={`${formatBps(vested)} vested`} />
      <ProgressRow label="Deliverables" value={deliverablePct} detail={`${stakeholder.deliverables.length} gates`} />
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {stakeholder.deliverables.map((deliverable) => (
          <div key={deliverable.id} className="flex items-start justify-between gap-2 text-[12px]">
            <span className="min-w-0 text-text-secondary">{deliverable.title}</span>
            <Badge variant={STATUS_BADGE[deliverable.status]} className="shrink-0">
              {STATUS_LABEL[deliverable.status]}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
        <span className="text-text-secondary">{label}</span>
        <span className="tabular-nums text-text-primary">{detail}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-background">
        <div
          className="h-full rounded-full bg-[var(--primary)]"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

function GovernanceItem({
  title,
  detail,
  status,
  tone,
}: {
  title: string;
  detail: string;
  status: string;
  tone: ReviewTone;
}) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-surface p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[12.5px] font-medium text-text-primary">{title}</div>
        <Badge variant={TONE_BADGE[tone]}>{status}</Badge>
      </div>
      <p className="mt-1 text-[12px] leading-4 text-text-secondary">{detail}</p>
    </div>
  );
}
