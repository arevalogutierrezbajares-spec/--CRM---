import { describe, expect, it } from "vitest";
import { computePlanDrift, driftIsEmpty } from "@/lib/plan-drift";
import type { RoadmapSnapshot, RoadmapTaskNode } from "@/lib/roadmap-md";

function task(id: string, title: string, extra: Partial<RoadmapTaskNode> = {}): RoadmapTaskNode {
  return {
    id,
    token: null,
    title,
    done: false,
    ownerHandle: null,
    dueDate: null,
    children: [],
    ...extra,
  };
}

function snap(): RoadmapSnapshot {
  return {
    initiatives: [
      {
        id: "init-1",
        token: null,
        title: "Launch",
        ownerHandle: null,
        status: "active",
        health: "green",
        startDate: "2026-06-01",
        targetEndDate: "2026-08-31",
        successCriteria: null,
        goal: null,
        tasks: [
          task("t-1", "Checkout", { dueDate: "2026-07-01" }),
          task("t-2", "QA"),
        ],
      },
    ],
  };
}

describe("computePlanDrift (FR-PLN-1)", () => {
  it("no changes → empty drift", () => {
    expect(driftIsEmpty(computePlanDrift(snap(), snap()))).toBe(true);
  });

  it("detects completion, slip, addition, reopen, new and gone initiatives", () => {
    const base = snap();
    const current = snap();
    // complete t-1, slip its due date, add t-3
    current.initiatives[0].tasks[0].done = true;
    current.initiatives[0].tasks[0].dueDate = "2026-07-15";
    current.initiatives[0].tasks.push(task("t-3", "Docs"));
    // slip initiative target
    current.initiatives[0].targetEndDate = "2026-09-30";
    // new initiative with one task
    current.initiatives.push({
      ...snap().initiatives[0],
      id: "init-2",
      title: "Brand",
      tasks: [task("t-9", "Logo")],
    });
    // base had a done task that's reopened now
    base.initiatives[0].tasks[1].done = true;

    const d = computePlanDrift(base, current);
    expect(d.tasksCompleted).toEqual([
      { id: "t-1", title: "Checkout", initiativeTitle: "Launch" },
    ]);
    expect(d.tasksReopened).toEqual([{ id: "t-2", title: "QA", initiativeTitle: "Launch" }]);
    expect(d.tasksAdded.map((t) => t.id).sort()).toEqual(["t-3", "t-9"]);
    expect(d.newInitiatives).toEqual([{ id: "init-2", title: "Brand" }]);
    expect(d.dateSlips).toHaveLength(2); // initiative target + t-1 due
    const initSlip = d.dateSlips.find((s) => s.kind === "initiative");
    expect(initSlip).toMatchObject({ planned: "2026-08-31", now: "2026-09-30" });
  });

  it("initiative missing from current is reported gone (archived)", () => {
    const base = snap();
    const current: RoadmapSnapshot = { initiatives: [] };
    const d = computePlanDrift(base, current);
    expect(d.goneInitiatives).toEqual([{ id: "init-1", title: "Launch" }]);
  });
});
