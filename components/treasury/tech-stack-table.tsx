import Link from "next/link";
import { Server, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import { formatMoney } from "@/lib/fx";
import type { TechVendorRow } from "@/db/queries/treasury";

interface TechStackTableProps {
  rows: TechVendorRow[];
}

function trendOf(current: number, prev: number) {
  const delta = current - prev;
  if (prev === 0 && current === 0) return { icon: Minus, tone: "text-text-tertiary", label: "—" };
  if (prev === 0) return { icon: TrendingUp, tone: "text-amber-text", label: "new" };
  const pct = Math.round((delta / prev) * 100);
  if (Math.abs(pct) < 5) return { icon: Minus, tone: "text-text-tertiary", label: "flat" };
  return delta > 0
    ? { icon: TrendingUp, tone: "text-red-text", label: `+${pct}%` }
    : { icon: TrendingDown, tone: "text-green-text", label: `${pct}%` };
}

export function TechStackTable({ rows }: TechStackTableProps) {
  return (
    <DashCard>
      <SectionLabel
        icon={Server}
        right={
          <Link
            href="/treasury/vendors"
            className="text-tiny text-text-secondary hover:text-text-primary"
          >
            All vendors
          </Link>
        }
      >
        Tech stack spend
      </SectionLabel>
      {rows.length === 0 ? (
        <p className="py-3 text-[12px] text-text-secondary">
          No vendor transactions yet. Tag a vendor on a transaction to see it here.
        </p>
      ) : (
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-tiny text-text-tertiary uppercase tracking-wider">
              <th className="text-left font-medium pb-2">Vendor</th>
              <th className="text-right font-medium pb-2">This month</th>
              <th className="text-right font-medium pb-2">Last month</th>
              <th className="text-right font-medium pb-2">Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 10).map((r) => {
              const trend = trendOf(r.currentMonthUsdCents, r.prevMonthUsdCents);
              const Icon = trend.icon;
              return (
                <tr
                  key={r.vendorId}
                  className="border-t"
                  style={{ borderColor: "var(--border-default)" }}
                >
                  <td className="py-1.5">
                    <span className="text-text-primary">{r.vendorName}</span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums font-medium text-text-primary">
                    {formatMoney(r.currentMonthUsdCents, "USD")}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-text-secondary">
                    {formatMoney(r.prevMonthUsdCents, "USD")}
                  </td>
                  <td className="py-1.5 text-right">
                    <span
                      className={`inline-flex items-center gap-1 ${trend.tone} tabular-nums`}
                    >
                      <Icon size={12} />
                      {trend.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </DashCard>
  );
}
