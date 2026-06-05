import Link from "next/link";
import { BarChart3, ArrowRight } from "lucide-react";
import { fmtVal, HEALTH_LABEL } from "@/lib/priorities/format";
import type { ScorecardRow } from "@/db/queries/okrs";

const HEALTH: Record<string, string> = {
  green: "var(--green-mid)",
  amber: "var(--amber-text)",
  red: "var(--red-text)",
};

/**
 * The weekly scorecard — key results flagged for Home, shown as owned numbers
 * with target + red/amber/green. The fastest "are we on track?" read.
 */
export function Scorecard({ rows }: { rows: ScorecardRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BarChart3 size={14} className="text-text-tertiary" />
          <span className="text-[13px] font-semibold text-text-primary">Scorecard</span>
          <span className="text-tiny text-text-tertiary">· this quarter</span>
        </div>
        <Link href="/priorities" className="flex items-center gap-0.5 text-tiny text-[var(--blue-text)] hover:underline">
          Priorities <ArrowRight size={11} />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {rows.map((r) => {
          const pct = Math.round(r.progress * 100);
          return (
            <div key={r.id} className="rounded-lg bg-surface p-2.5" title={`${r.objectiveTitle}${r.ownerName ? ` · ${r.ownerName}` : ""} — ${HEALTH_LABEL[r.health]}`}>
              <div className="flex items-baseline gap-1">
                <span className="text-[18px] font-medium leading-none tabular-nums text-text-primary">
                  {fmtVal(r.current, r.unit)}
                </span>
                <span className="text-tiny tabular-nums text-text-tertiary">/ {fmtVal(r.target, r.unit)}</span>
              </div>
              <div className="mt-1 truncate text-[11px] text-text-secondary">{r.title}</div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-card">
                  <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: HEALTH[r.health] }} />
                </span>
                <span className="text-tiny tabular-nums" style={{ color: HEALTH[r.health] }} aria-label={`${pct}% — ${HEALTH_LABEL[r.health]}`}>{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
