import { TrendingDown, Clock } from "lucide-react";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import { formatMoneyCompact } from "@/lib/fx";

interface BurnRunwayProps {
  burn30dUsdCents: number;
  burnMTDUsdCents: number;
  runwayMonths: number | null;
}

export function BurnRunwayCard({
  burn30dUsdCents,
  burnMTDUsdCents,
  runwayMonths,
}: BurnRunwayProps) {
  const dailyBurn = Math.round(burn30dUsdCents / 30);

  const runwayLabel =
    runwayMonths === null
      ? "—"
      : runwayMonths > 24
        ? "24+ mo"
        : `${runwayMonths.toFixed(1)} mo`;

  const runwayTone =
    runwayMonths === null
      ? "text-text-secondary"
      : runwayMonths < 3
        ? "text-red-text"
        : runwayMonths < 6
          ? "text-amber-text"
          : "text-green-text";

  return (
    <DashCard>
      <SectionLabel icon={TrendingDown}>Burn & runway</SectionLabel>
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-tiny text-text-secondary">Daily (30d avg)</span>
          <span className="text-[15px] font-medium tabular-nums text-text-primary">
            {formatMoneyCompact(dailyBurn, "USD")}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-tiny text-text-secondary">Month to date</span>
          <span className="text-[15px] font-medium tabular-nums text-text-primary">
            {formatMoneyCompact(burnMTDUsdCents, "USD")}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2 pt-1 border-t" style={{ borderColor: "var(--border-default)" }}>
          <span className="text-tiny text-text-secondary flex items-center gap-1">
            <Clock size={11} /> Runway
          </span>
          <span className={`text-[18px] font-medium tabular-nums ${runwayTone}`}>
            {runwayLabel}
          </span>
        </div>
      </div>
    </DashCard>
  );
}
