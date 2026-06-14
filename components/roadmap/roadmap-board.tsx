"use client";

/**
 * Roadmap board — owns the shared "selected milestone" state so the timeline
 * and the plan stay in sync. Click a bar → its deliverables expand inline AND
 * the plan below filters to that milestone. Click again / "show all" → reset.
 */

import { useEffect, useState } from "react";
import { RoadmapTimeline, type TimelineGroup } from "./roadmap-timeline";
import { PlanDoc } from "./plan-doc";
import type { PlanDocData, PlanDocInitiative } from "@/db/queries/roadmap";

export function RoadmapBoard({
  timeline,
  planData,
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
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
      <RoadmapTimeline
        {...timeline}
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
    </div>
  );
}
