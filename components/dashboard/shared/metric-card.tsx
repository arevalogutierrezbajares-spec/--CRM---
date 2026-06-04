import { cn } from "@/lib/utils";
import { CountUp } from "./count-up";

interface MetricCardProps {
  value: string | number;
  label: string;
  delta?: string;
  deltaTone?: "neutral" | "good" | "warn" | "bad";
  className?: string;
}

const DELTA_TONE: Record<NonNullable<MetricCardProps["deltaTone"]>, string> = {
  neutral: "text-text-tertiary",
  good: "text-green-text",
  warn: "text-amber-text",
  bad: "text-red-text",
};

export function MetricCard({
  value,
  label,
  delta,
  deltaTone = "neutral",
  className,
}: MetricCardProps) {
  return (
    <div className={cn("bg-surface rounded-md p-2.5", className)}>
      <div className="text-[22px] font-medium leading-none text-text-primary">
        {typeof value === "number" ? <CountUp value={value} /> : value}
      </div>
      <div className="text-[11px] text-text-secondary mt-1">{label}</div>
      {delta && (
        <div className={cn("text-tiny mt-0.5", DELTA_TONE[deltaTone])}>
          {delta}
        </div>
      )}
    </div>
  );
}
