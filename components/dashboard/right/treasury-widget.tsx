import Link from "next/link";
import { Wallet } from "lucide-react";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { formatMoneyCompact } from "@/lib/fx";
import type { TreasurySnapshot } from "@/db/queries/treasury";

interface TreasuryWidgetProps {
  snapshot: TreasurySnapshot;
}

export function TreasuryWidget({ snapshot }: TreasuryWidgetProps) {
  const dailyBurn = Math.round(snapshot.burn30dUsdCents / 30);
  const runwayLabel =
    snapshot.runwayMonths === null
      ? "—"
      : snapshot.runwayMonths > 24
        ? "24+ mo"
        : `${snapshot.runwayMonths.toFixed(1)} mo`;
  const runwayTone =
    snapshot.runwayMonths === null
      ? "text-text-secondary"
      : snapshot.runwayMonths < 3
        ? "text-red-text"
        : snapshot.runwayMonths < 6
          ? "text-amber-text"
          : "text-green-text";

  return (
    <DashCard>
      <SectionLabel
        icon={Wallet}
        right={
          <Link
            href="/treasury"
            className="text-tiny text-text-secondary hover:text-text-primary"
          >
            Open
          </Link>
        }
      >
        Treasury
      </SectionLabel>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-tiny text-text-secondary">Cash</span>
          <span className="text-[15px] font-medium tabular-nums text-text-primary">
            {formatMoneyCompact(snapshot.cashUsdCents, "USD")}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-tiny text-text-secondary">Daily burn</span>
          <span className="text-[13px] tabular-nums text-text-primary">
            {formatMoneyCompact(dailyBurn, "USD")}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-tiny text-text-secondary">Runway</span>
          <span className={`text-[13px] font-medium tabular-nums ${runwayTone}`}>
            {runwayLabel}
          </span>
        </div>
      </div>
    </DashCard>
  );
}
