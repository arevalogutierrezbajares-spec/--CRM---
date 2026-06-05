"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateKeyResultAction } from "@/app/(app)/priorities/actions";
import type { KpiPickRow } from "@/db/queries/okrs";

/**
 * Pick which key results surface as headline KPIs above Town Hall. The KRs
 * themselves live in Priorities — this just toggles is_kpi (one source of truth).
 */
export function KpiSettings({ rows }: { rows: KpiPickRow[] }) {
  const [state, setState] = useState(rows);
  const [, start] = useTransition();

  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No key results yet — add objectives + key results in Priorities, then star them as KPIs here.
      </p>
    );
  }

  const count = state.filter((r) => r.isKpi).length;

  function toggle(id: string, next: boolean) {
    setState((s) => s.map((r) => (r.id === id ? { ...r, isKpi: next } : r)));
    start(async () => {
      const res = await updateKeyResultAction({ id, isKpi: next });
      if (!res.ok) {
        toast.error(res.error);
        setState(rows); // revert
      }
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--muted-foreground)]">
        {count} selected · shown as the KPI strip on Home. Recommended 3.
      </p>
      <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
        {state.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-2">
            <input
              type="checkbox"
              checked={r.isKpi}
              onChange={(e) => toggle(r.id, e.target.checked)}
              className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--blue-mid)]"
              aria-label={`Show "${r.title}" as a KPI`}
            />
            <div className="min-w-0">
              <div className="truncate text-sm text-text-primary">{r.title}</div>
              <div className="truncate text-xs text-[var(--muted-foreground)]">{r.objectiveTitle}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
