"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Pencil, Target, X } from "lucide-react";
import { toast } from "sonner";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { fmtVal } from "@/lib/priorities/format";
import { updateKeyResultAction } from "@/app/(app)/priorities/actions";
import type { KpiRow } from "@/db/queries/okrs";

const TONE = { green: "var(--green-mid)", amber: "var(--amber-text)", red: "var(--red-text)" } as const;
const PACE_LABEL = { green: "On track", amber: "At risk", red: "Behind" } as const;
const PACE_FULL = { green: "On track vs plan", amber: "At risk vs plan", red: "Behind plan" } as const;
type Health = keyof typeof TONE;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function PacePill({ health }: { health: Health }) {
  const c = TONE[health];
  return (
    <span
      role="img"
      aria-label={PACE_FULL[health]}
      title={PACE_FULL[health]}
      className="flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ background: `color-mix(in oklab, ${c} 13%, transparent)`, color: c }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {PACE_LABEL[health]}
    </span>
  );
}

/** Headline KPIs (key results flagged is_kpi in Priorities) as a clean vertical list,
 *  each with a Red/Amber/Green pace pill. Values are inline-editable: click a value
 *  to update its progress right here (optimistic bar + persisted via the key-result
 *  action) — no trip to Settings. */
export function KpiStrip({ kpis }: { kpis: KpiRow[] }) {
  const router = useRouter();
  // Optimistic current-value overrides, keyed by KPI id, applied until the
  // server refresh reconciles the authoritative progress/pace.
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [, startSave] = useTransition();

  if (kpis.length === 0) return null;

  function startEdit(k: KpiRow, current: number) {
    setEditingId(k.id);
    setDraft(String(current));
  }
  function cancel() {
    setEditingId(null);
    setDraft("");
  }
  function commit(k: KpiRow, value: number) {
    if (!Number.isFinite(value)) {
      cancel();
      return;
    }
    setOverrides((o) => ({ ...o, [k.id]: value }));
    setEditingId(null);
    setDraft("");
    startSave(async () => {
      const res = await updateKeyResultAction({ id: k.id, current: value });
      if (!res.ok) {
        toast.error(res.error ?? "Could not update KPI.");
        setOverrides((o) => {
          const next = { ...o };
          delete next[k.id];
          return next;
        });
      } else {
        router.refresh();
      }
    });
  }

  return (
    <DashCard>
      <div className="flex items-center justify-between">
        <SectionLabel icon={Target}>KPIs</SectionLabel>
        <Link href="/workspace" className="text-tiny text-text-tertiary hover:text-text-secondary">
          Configure
        </Link>
      </div>

      <ul className="mt-2.5 space-y-3">
        {kpis.map((k) => {
          const edited = k.id in overrides;
          const current = edited ? overrides[k.id] : k.current;
          const range = k.target - k.startValue;
          const prog = edited
            ? range === 0
              ? current >= k.target
                ? 1
                : 0
              : clamp01((current - k.startValue) / range)
            : k.progress;
          const pct = Math.max(0, Math.min(100, Math.round(prog * 100)));
          const c = TONE[k.paceHealth];
          const value = k.binary
            ? pct >= 100
              ? "Done"
              : "Pending"
            : `${fmtVal(current, null)} / ${fmtVal(k.target, k.unit)}`;
          const isEditing = editingId === k.id;
          return (
            <li key={k.id}>
              <div className="flex items-center justify-between gap-2">
                <Link
                  href="/priorities"
                  title={k.objectiveTitle}
                  className="min-w-0 truncate text-[12.5px] font-medium text-text-primary hover:underline"
                >
                  {k.title}
                </Link>
                <PacePill health={k.paceHealth} />
              </div>
              <div className="mt-1.5 flex items-center gap-2.5">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                  <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: c }} />
                </div>

                {isEditing ? (
                  k.binary ? (
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => commit(k, k.target)}
                        className="rounded-full bg-[color-mix(in_oklab,var(--green-mid)_15%,transparent)] px-2 py-0.5 text-tiny font-medium text-[var(--green-text)] hover:opacity-80"
                      >
                        Done
                      </button>
                      <button
                        type="button"
                        onClick={() => commit(k, k.startValue)}
                        className="rounded-full bg-surface px-2 py-0.5 text-tiny text-text-secondary hover:opacity-80"
                      >
                        Pending
                      </button>
                      <button type="button" onClick={cancel} aria-label="Cancel" className="text-text-tertiary hover:text-text-primary">
                        <X size={13} />
                      </button>
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1">
                      <input
                        type="number"
                        value={draft}
                        autoFocus
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commit(k, Number(draft));
                          else if (e.key === "Escape") cancel();
                        }}
                        className="h-6 w-16 rounded border bg-transparent px-1.5 text-right text-tiny tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                        style={{ borderColor: "var(--border-default)" }}
                        aria-label={`Update ${k.title}`}
                      />
                      {k.unit && <span className="text-tiny text-text-tertiary">{k.unit}</span>}
                      <button
                        type="button"
                        onClick={() => commit(k, Number(draft))}
                        aria-label="Save"
                        className="text-[var(--green-text)] hover:opacity-80"
                      >
                        <Check size={14} />
                      </button>
                      <button type="button" onClick={cancel} aria-label="Cancel" className="text-text-tertiary hover:text-text-primary">
                        <X size={13} />
                      </button>
                    </span>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(k, current)}
                    title={`${value} — click to update`}
                    className="group flex min-w-0 max-w-[58%] items-center gap-1 rounded px-1 text-tiny tabular-nums text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
                  >
                    <span className="truncate">{value}</span>
                    <Pencil size={11} className="shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                )}

                <span className="w-9 shrink-0 text-right text-tiny tabular-nums text-text-tertiary">{pct}%</span>
              </div>
            </li>
          );
        })}
      </ul>
    </DashCard>
  );
}
