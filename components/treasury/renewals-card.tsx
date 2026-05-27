import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import { DashBadge } from "@/components/dashboard/shared/badge";
import { formatMoney } from "@/lib/fx";
import type { UpcomingRenewal } from "@/db/queries/treasury";

interface RenewalsCardProps {
  renewals: UpcomingRenewal[];
}

function dueLabel(days: number): { text: string; tone: "amber" | "blue" | "neutral" } {
  if (days <= 3) return { text: `in ${days}d`, tone: "amber" };
  if (days <= 14) return { text: `in ${days}d`, tone: "blue" };
  return { text: `in ${days}d`, tone: "neutral" };
}

export function RenewalsCard({ renewals }: RenewalsCardProps) {
  return (
    <DashCard>
      <SectionLabel
        icon={CalendarClock}
        right={
          <Link
            href="/treasury/subscriptions"
            className="text-tiny text-text-secondary hover:text-text-primary"
          >
            All
          </Link>
        }
      >
        Renewals (next 30 days)
      </SectionLabel>
      {renewals.length === 0 ? (
        <p className="py-3 text-[12px] text-text-secondary">
          Nothing renewing soon.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {renewals.slice(0, 8).map((r) => {
            const label = dueLabel(r.daysUntil);
            return (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded px-1 py-0.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] text-text-primary truncate">
                    {r.vendorName}
                    {r.planName && (
                      <span className="text-text-tertiary"> · {r.planName}</span>
                    )}
                  </div>
                  <div className="text-tiny text-text-tertiary">
                    {formatMoney(r.priceCents, r.currency)} / {r.cycle}
                  </div>
                </div>
                <DashBadge variant={label.tone}>{label.text}</DashBadge>
              </li>
            );
          })}
        </ul>
      )}
    </DashCard>
  );
}
