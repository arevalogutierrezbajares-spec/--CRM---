import Link from "next/link";
import { Brain, ServerCog } from "lucide-react";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { formatMoney } from "@/lib/fx";

interface AiTechSpendProps {
  ai: {
    tokensIn: number;
    tokensOut: number;
    costMillicents: number;
  };
  tech: {
    todayUsdCents: number;
    monthToDateUsdCents: number;
  };
}

function formatMillicentCost(costMillicents: number): string {
  return formatMoney(Math.round(costMillicents / 10), "USD");
}

function formatTokens(tokensIn: number, tokensOut: number): string {
  return `${tokensIn.toLocaleString()} in · ${tokensOut.toLocaleString()} out`;
}

export function AiTechSpendCard({ ai, tech }: AiTechSpendProps) {
  return (
    <DashCard>
      <SectionLabel
        icon={Brain}
        right={
          <Link
            href="/treasury"
            className="text-tiny text-text-secondary hover:text-text-primary"
          >
            Open Treasury
          </Link>
        }
      >
        AI + Tech spend
      </SectionLabel>
      <div className="grid gap-2.5 text-[12.5px]">
        <div className="rounded border border-[var(--border-default)] p-2">
          <div className="text-tiny text-text-tertiary">AI (today)</div>
          <div className="mt-0.5 flex items-baseline justify-between">
            <span className="text-text-secondary">Spend</span>
            <span className="tabular-nums text-text-primary">{formatMillicentCost(ai.costMillicents)}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between text-tiny text-text-tertiary">
            <span>Tokens</span>
            <span className="tabular-nums">{formatTokens(ai.tokensIn, ai.tokensOut)}</span>
          </div>
        </div>

        <div className="rounded border border-[var(--border-default)] p-2">
          <div className="text-tiny text-text-tertiary inline-flex items-center gap-1">
            <ServerCog size={12} />
            Tech spend
          </div>
          <div className="mt-0.5 flex items-baseline justify-between">
            <span className="text-text-secondary">Today</span>
            <span className="tabular-nums text-text-primary">{formatMoney(tech.todayUsdCents, "USD")}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between text-tiny text-text-tertiary">
            <span>MTD</span>
            <span className="tabular-nums">{formatMoney(tech.monthToDateUsdCents, "USD")}</span>
          </div>
        </div>
      </div>
    </DashCard>
  );
}
