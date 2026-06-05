import { describe, expect, it } from "vitest";
import {
  bpsToShares,
  buildDeterministicAdvisor,
  buildEquityOverview,
  deliverableCompletionPct,
  formatBps,
  scoreScenario,
  vestedBps,
} from "@/lib/equity/calculations";
import type { EquityPool, EquityRoleBand, EquityStakeholder } from "@/lib/equity/types";

const roleBand: EquityRoleBand = {
  id: "lead",
  label: "Functional lead",
  benchmarkLowBps: 75,
  benchmarkHighBps: 250,
  defaultBps: 150,
  defaultVestingMonths: 48,
  defaultCliffMonths: 12,
  recommendedDeliverables: [],
};

describe("equity calculations", () => {
  it("formats basis points as ownership percentages", () => {
    expect(formatBps(25)).toBe("0.25%");
    expect(formatBps(150)).toBe("1.50%");
    expect(formatBps(1200)).toBe("12%");
  });

  it("converts basis points to fully diluted shares", () => {
    expect(bpsToShares(125, 10_000_000)).toBe(125_000);
  });

  it("does not vest before cliff and vests linearly after cliff", () => {
    const vesting = {
      startDate: "2026-01-01",
      cliffMonths: 12,
      durationMonths: 48,
      cadence: "monthly" as const,
    };

    expect(vestedBps(200, vesting, "2026-12-31")).toBe(0);
    expect(vestedBps(200, vesting, "2027-01-01")).toBe(50);
    expect(vestedBps(200, vesting, "2030-01-01")).toBe(200);
  });

  it("weights deliverable completion by status and importance", () => {
    expect(
      deliverableCompletionPct([
        { status: "complete", weight: 50 },
        { status: "in_progress", weight: 30 },
        { status: "blocked", weight: 20 },
      ]),
    ).toBe(65);
  });

  it("summarizes granted, vested, pending, and pool availability", () => {
    const pool: EquityPool = {
      fullyDilutedShares: 10_000_000,
      founderAllocatedBps: 7_000,
      employeePoolBps: 1_000,
      advisorPoolBps: 200,
      strategicReserveBps: 1_800,
    };
    const stakeholders: EquityStakeholder[] = [
      {
        id: "s1",
        name: "A",
        role: "Lead",
        team: "Ops",
        grantType: "stock_option",
        status: "active",
        ownershipBps: 200,
        vesting: {
          startDate: "2026-01-01",
          cliffMonths: 12,
          durationMonths: 48,
          cadence: "monthly",
        },
        deliverables: [{ id: "d1", title: "Ship", owner: "A", status: "complete", dueDate: "2026-01-01", weight: 100, verification: "QA", roleImpact: "core" }],
        accessLevel: "recipient",
        lastReviewDate: "2026-01-01",
        nextReviewDate: "2026-07-01",
        notes: "",
      },
    ];

    const overview = buildEquityOverview({
      pool,
      stakeholders,
      proposals: [
        {
          id: "p1",
          candidateName: "B",
          roleBandId: "lead",
          roleTitle: "Lead",
          proposedBps: 100,
          grantType: "stock_option",
          stage: "needs_review",
          rationale: "",
          vesting: {
            startDate: "2026-01-01",
            cliffMonths: 12,
            durationMonths: 48,
            cadence: "monthly",
          },
          deliverables: [],
        },
      ],
      asOfDate: "2027-01-01",
    });

    expect(overview.grantedBps).toBe(200);
    expect(overview.vestedBps).toBe(50);
    expect(overview.pendingBps).toBe(100);
    expect(overview.availableEmployeePoolBps).toBe(700);
  });

  it("scores stronger scenarios above weak governance scenarios", () => {
    const strong = scoreScenario(
      {
        roleBandId: "lead",
        proposedBps: 125,
        vestingMonths: 48,
        cliffMonths: 12,
        deliverableCount: 4,
        criticalDeliverables: 3,
      },
      roleBand,
    );
    const weak = scoreScenario(
      {
        roleBandId: "lead",
        proposedBps: 450,
        vestingMonths: 12,
        cliffMonths: 0,
        deliverableCount: 0,
        criticalDeliverables: 0,
      },
      roleBand,
    );

    expect(strong).toBeGreaterThan(weak);
  });

  it("downgrades advisor decisions when proposed equity exceeds the band", () => {
    const advisor = buildDeterministicAdvisor({
      scenario: {
        roleBandId: "lead",
        proposedBps: 450,
        vestingMonths: 24,
        cliffMonths: 0,
        deliverableCount: 1,
        criticalDeliverables: 0,
      },
      roleBand,
      availablePoolBps: 500,
    });

    expect(advisor.decision).not.toBe("approve");
    expect(advisor.risks.join(" ")).toContain("above the role band");
  });
});
