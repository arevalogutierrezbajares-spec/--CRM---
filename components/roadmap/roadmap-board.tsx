"use client";

/**
 * Roadmap board — owns the shared "selected milestone" state so the timeline
 * and the plan stay in sync. Click a bar → its deliverables expand inline AND
 * the plan below filters to that milestone. Click again / "show all" → reset.
 */

import { useEffect, useMemo, useState } from "react";
import { RoadmapTimeline, type TimelineGroup } from "./roadmap-timeline";
import { PlanDoc } from "./plan-doc";
import { BulkEditOutline } from "./bulk-edit-outline";
import type {
  InitiativeDependency,
  PlanDocData,
  PlanDocInitiative,
} from "@/db/queries/roadmap";

const DAY = 86_400_000;

/** Critical path = the longest chain by summed duration over the dependency
 *  DAG. Returns the set of initiative ids on that chain. */
function computeCriticalIds(
  inits: PlanDocInitiative[],
  deps: InitiativeDependency[],
): Set<string> {
  if (deps.length === 0) return new Set();
  const dur = new Map<string, number>();
  for (const i of inits) {
    const s = i.startDate ? Date.parse(i.startDate) : null;
    const e = i.targetEndDate ? Date.parse(i.targetEndDate) : null;
    dur.set(i.id, s != null && e != null ? Math.max(1, (e - s) / DAY) : 1);
  }
  const preds = new Map<string, string[]>();
  for (const d of deps) {
    const a = preds.get(d.toInitiativeId) ?? [];
    a.push(d.fromInitiativeId);
    preds.set(d.toInitiativeId, a);
  }
  const memo = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const longest = (n: string): number => {
    const cached = memo.get(n);
    if (cached != null) return cached;
    memo.set(n, dur.get(n) ?? 1); // re-entry guard (DAG, so safe)
    let best = 0;
    let bp: string | null = null;
    for (const p of preds.get(n) ?? []) {
      const v = longest(p);
      if (v > best) {
        best = v;
        bp = p;
      }
    }
    const total = best + (dur.get(n) ?? 1);
    memo.set(n, total);
    parent.set(n, bp);
    return total;
  };
  let maxNode: string | null = null;
  let maxVal = -1;
  for (const i of inits) {
    const v = longest(i.id);
    if (v > maxVal) {
      maxVal = v;
      maxNode = i.id;
    }
  }
  const crit = new Set<string>();
  let cur: string | null = maxNode;
  while (cur) {
    crit.add(cur);
    cur = parent.get(cur) ?? null;
  }
  return crit;
}

export function RoadmapBoard({
  timeline,
  planData,
  deps,
}: {
  timeline: {
    monthCount: number;
    months: Array<{ label: string }>;
    windowStartMs: number;
    windowTotalMs: number;
    todayPct: number;
    groups: TimelineGroup[];
    detailsById: Record<string, PlanDocInitiative>;
  };
  planData: PlanDocData;
  deps: InitiativeDependency[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bulkEdit, setBulkEdit] = useState(false);
  const criticalIds = useMemo(
    () => computeCriticalIds(planData.initiatives, deps),
    [planData.initiatives, deps],
  );
  const initiativeList = useMemo(
    () => planData.initiatives.map((i) => ({ id: i.id, title: i.title })),
    [planData.initiatives],
  );
  const focused = selectedId
    ? planData.initiatives.find((i) => i.id === selectedId)
    : null;

  // Flat, display-ordered list of milestone ids for keyboard navigation.
  const orderedIds = timeline.groups.flatMap((g) => g.items.map((i) => i.id));

  // ↑/↓ move between milestones, Esc clears — unless typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "Escape") {
        setSelectedId(null);
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      if (orderedIds.length === 0) return;
      e.preventDefault();
      const cur = selectedId ? orderedIds.indexOf(selectedId) : -1;
      const next =
        e.key === "ArrowDown"
          ? cur < 0
            ? 0
            : Math.min(orderedIds.length - 1, cur + 1)
          : cur < 0
            ? orderedIds.length - 1
            : Math.max(0, cur - 1);
      setSelectedId(orderedIds[next]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, orderedIds]);

  // Keep the selected milestone in view as you navigate.
  useEffect(() => {
    if (!selectedId) return;
    const el = document.querySelector(`[data-init="${selectedId}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setBulkEdit((b) => !b)}
          className={`rounded-md border px-2.5 py-1 text-[12px] font-medium ${bulkEdit ? "text-white" : "text-text-secondary hover:text-text-primary"}`}
          style={{
            borderColor: bulkEdit ? "var(--blue-mid)" : "var(--border-default)",
            background: bulkEdit ? "var(--blue-mid)" : "transparent",
          }}
        >
          {bulkEdit ? "✓ Done" : "⊞ Bulk edit"}
        </button>
      </div>

      {bulkEdit ? (
        <BulkEditOutline data={planData} />
      ) : (
        <>
          <RoadmapTimeline
            {...timeline}
            members={planData.members}
            lobs={planData.lobs}
            deps={deps}
            criticalIds={criticalIds}
            initiativeList={initiativeList}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-label text-text-secondary truncate">
                {focused ? `Focused: ${focused.title}` : "The plan"}
              </h2>
              <div className="flex items-center gap-2.5 shrink-0">
                <span className="hidden sm:inline text-tiny text-text-tertiary">
                  ↑↓ navigate · Esc to clear
                </span>
                {selectedId && (
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="rounded-md border px-2 py-1 text-[12px] text-text-secondary hover:text-text-primary"
                    style={{ borderColor: "var(--border-default)" }}
                  >
                    ✕ Show all
                  </button>
                )}
              </div>
            </div>
            <PlanDoc data={planData} focusId={selectedId} />
          </section>
        </>
      )}
    </div>
  );
}
