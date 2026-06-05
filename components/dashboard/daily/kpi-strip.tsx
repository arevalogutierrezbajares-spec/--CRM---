import Link from "next/link";
import { Target } from "lucide-react";
import { fmtVal } from "@/lib/priorities/format";
import type { ScorecardRow } from "@/db/queries/okrs";

const TONE: Record<string, string> = {
  green: "var(--green-mid)",
  amber: "var(--amber-text)",
  red: "var(--red-text)",
};

/** Headline KPI strip above Town Hall — the key results flagged is_kpi in Priorities. */
export function KpiStrip({ kpis }: { kpis: ScorecardRow[] }) {
  if (kpis.length === 0) return null;
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-label text-text-tertiary">
        <Target size={12} /> KPIs
        <Link href="/workspace" className="ml-auto text-tiny text-text-tertiary hover:text-text-secondary">
          Configure
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {kpis.map((k) => {
          const pct = Math.round(k.progress * 100);
          const binary = k.target === 1 && !k.unit;
          const done = pct >= 100;
          return (
            <Link
              key={k.id}
              href="/priorities"
              className="rounded-lg border bg-card px-3 py-2.5 transition-colors hover:border-[var(--blue-mid)]"
              style={{ borderColor: "var(--border-default)" }}
              title={k.objectiveTitle}
            >
              <div className="text-label text-text-tertiary line-clamp-1">{k.title}</div>
              <div className="mt-0.5 flex items-baseline gap-1 tabular-nums">
                {binary ? (
                  <span
                    className="text-[18px] font-semibold"
                    style={{ color: done ? "var(--green-mid)" : "var(--text-primary)" }}
                  >
                    {done ? "Done ✓" : "Not yet"}
                  </span>
                ) : (
                  <>
                    <span className="text-[20px] font-semibold text-text-primary">{fmtVal(k.current, k.unit)}</span>
                    <span className="text-tiny text-text-tertiary">/ {fmtVal(k.target, k.unit)}</span>
                  </>
                )}
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: TONE[k.health] }} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
