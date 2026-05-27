import { Wallet } from "lucide-react";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import { formatMoneyCompact } from "@/lib/fx";

interface CashPositionCardProps {
  cashUsdCents: number;
  cashByCurrency: Array<{ currency: string; cents: number }>;
}

export function CashPositionCard({
  cashUsdCents,
  cashByCurrency,
}: CashPositionCardProps) {
  return (
    <DashCard>
      <SectionLabel icon={Wallet}>Cash on hand</SectionLabel>
      <div className="text-[28px] font-medium leading-none text-text-primary tabular-nums">
        {formatMoneyCompact(cashUsdCents, "USD")}
      </div>
      {cashByCurrency.length > 1 && (
        <div className="mt-2 space-y-1">
          {cashByCurrency.map((c) => (
            <div
              key={c.currency}
              className="flex justify-between text-tiny text-text-secondary tabular-nums"
            >
              <span>{c.currency}</span>
              <span>{formatMoneyCompact(c.cents, c.currency)}</span>
            </div>
          ))}
        </div>
      )}
    </DashCard>
  );
}
