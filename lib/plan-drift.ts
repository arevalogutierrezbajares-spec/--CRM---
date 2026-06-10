/**
 * Plan drift — what changed since the last committed plan (FR-PLN-1, FR-PLV-3).
 * Pure comparison of two RoadmapSnapshots (base = last commit, current = now).
 */

import type { RoadmapSnapshot, RoadmapTaskNode } from "@/lib/roadmap-md";

export type DateSlip = {
  kind: "initiative" | "task";
  id: string;
  title: string;
  field: "targetEndDate" | "dueDate";
  planned: string | null;
  now: string | null;
};

export type PlanDrift = {
  newInitiatives: Array<{ id: string; title: string }>;
  goneInitiatives: Array<{ id: string; title: string }>;
  dateSlips: DateSlip[];
  tasksCompleted: Array<{ id: string; title: string; initiativeTitle: string }>;
  tasksAdded: Array<{ id: string; title: string; initiativeTitle: string }>;
  /** done in plan, reopened since */
  tasksReopened: Array<{ id: string; title: string; initiativeTitle: string }>;
};

function flat(
  tasks: RoadmapTaskNode[],
): RoadmapTaskNode[] {
  const out: RoadmapTaskNode[] = [];
  for (const t of tasks) {
    out.push(t);
    out.push(...flat(t.children));
  }
  return out;
}

export function computePlanDrift(
  base: RoadmapSnapshot,
  current: RoadmapSnapshot,
): PlanDrift {
  const drift: PlanDrift = {
    newInitiatives: [],
    goneInitiatives: [],
    dateSlips: [],
    tasksCompleted: [],
    tasksAdded: [],
    tasksReopened: [],
  };

  const baseInits = new Map(base.initiatives.filter((i) => i.id).map((i) => [i.id!, i]));
  const curInits = new Map(
    current.initiatives.filter((i) => i.id).map((i) => [i.id!, i]),
  );

  for (const [id, ci] of curInits) {
    const bi = baseInits.get(id);
    if (!bi) {
      drift.newInitiatives.push({ id, title: ci.title });
      // tasks of a brand-new initiative count as added
      for (const t of flat(ci.tasks)) {
        if (t.id)
          drift.tasksAdded.push({ id: t.id, title: t.title, initiativeTitle: ci.title });
      }
      continue;
    }

    if ((bi.targetEndDate ?? null) !== (ci.targetEndDate ?? null)) {
      drift.dateSlips.push({
        kind: "initiative",
        id,
        title: ci.title,
        field: "targetEndDate",
        planned: bi.targetEndDate ?? null,
        now: ci.targetEndDate ?? null,
      });
    }

    const baseTasks = new Map(flat(bi.tasks).filter((t) => t.id).map((t) => [t.id!, t]));
    const curTasks = new Map(flat(ci.tasks).filter((t) => t.id).map((t) => [t.id!, t]));

    for (const [tid, ct] of curTasks) {
      const bt = baseTasks.get(tid);
      if (!bt) {
        drift.tasksAdded.push({ id: tid, title: ct.title, initiativeTitle: ci.title });
        continue;
      }
      if (!bt.done && ct.done)
        drift.tasksCompleted.push({ id: tid, title: ct.title, initiativeTitle: ci.title });
      if (bt.done && !ct.done)
        drift.tasksReopened.push({ id: tid, title: ct.title, initiativeTitle: ci.title });
      if ((bt.dueDate ?? null) !== (ct.dueDate ?? null)) {
        drift.dateSlips.push({
          kind: "task",
          id: tid,
          title: ct.title,
          field: "dueDate",
          planned: bt.dueDate ?? null,
          now: ct.dueDate ?? null,
        });
      }
    }
  }

  for (const [id, bi] of baseInits) {
    if (!curInits.has(id)) drift.goneInitiatives.push({ id, title: bi.title });
  }

  return drift;
}

export function driftIsEmpty(d: PlanDrift): boolean {
  return (
    d.newInitiatives.length === 0 &&
    d.goneInitiatives.length === 0 &&
    d.dateSlips.length === 0 &&
    d.tasksCompleted.length === 0 &&
    d.tasksAdded.length === 0 &&
    d.tasksReopened.length === 0
  );
}
