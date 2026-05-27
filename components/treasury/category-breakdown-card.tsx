import { PieChart } from "lucide-react";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import { formatMoneyCompact } from "@/lib/fx";
import type { CategoryBreakdownRow } from "@/db/queries/treasury";

interface CategoryBreakdownProps {
  rows: CategoryBreakdownRow[];
}

export function CategoryBreakdownCard({ rows }: CategoryBreakdownProps) {
  const total = rows.reduce((sum, r) => sum + r.usdCents, 0);

  return (
    <DashCard>
      <SectionLabel icon={PieChart}>Spending this month</SectionLabel>
      {total === 0 ? (
        <p className="py-3 text-[12px] text-text-secondary">
          No expenses logged yet this month.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.slice(0, 8).map((r) => {
            const pct = Math.round((r.usdCents / total) * 100);
            return (
              <div key={r.categoryId ?? "uncat"} className="space-y-1">
                <div className="flex justify-between text-[12px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: r.categoryColor ?? "#A8A8A4" }}
                    />
                    <span className="text-text-primary truncate">{r.categoryName}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 tabular-nums">
                    <span className="text-text-tertiary">{pct}%</span>
                    <span className="text-text-primary font-medium">
                      {formatMoneyCompact(r.usdCents, "USD")}
                    </span>
                  </div>
                </div>
                <div className="h-1 rounded-full bg-surface overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: r.categoryColor ?? "var(--text-tertiary)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashCard>
  );
}
