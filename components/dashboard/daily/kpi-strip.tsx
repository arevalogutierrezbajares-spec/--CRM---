import Link from "next/link";
import { Target } from "lucide-react";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { fmtVal } from "@/lib/priorities/format";
import type { KpiRow } from "@/db/queries/okrs";

const TONE = { green: "var(--green-mid)", amber: "var(--amber-text)", red: "var(--red-text)" } as const;
const PACE_LABEL = { green: "On track", amber: "At risk", red: "Behind" } as const;
const PACE_FULL = { green: "On track vs plan", amber: "At risk vs plan", red: "Behind plan" } as const;
type Health = keyof typeof TONE;

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
 *  each with a Red/Amber/Green pace pill measured against the plan's deadline. */
export function KpiStrip({ kpis }: { kpis: KpiRow[] }) {
  if (kpis.length === 0) return null;
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
          const pct = Math.max(0, Math.min(100, Math.round(k.progress * 100)));
          const c = TONE[k.paceHealth];
          const value = k.binary
            ? pct >= 100
              ? "Done"
              : "Pending"
            : `${fmtVal(k.current, null)} / ${fmtVal(k.target, k.unit)}`;
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
                <span className="shrink-0 text-tiny tabular-nums text-text-secondary">{value}</span>
                <span className="w-9 shrink-0 text-right text-tiny tabular-nums text-text-tertiary">{pct}%</span>
              </div>
            </li>
          );
        })}
      </ul>
    </DashCard>
  );
}
