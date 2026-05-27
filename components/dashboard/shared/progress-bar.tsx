import { cn } from "@/lib/utils";

interface ProgressBarProps {
  pct: number;
  fillClass?: string;
  className?: string;
}

export function ProgressBar({
  pct,
  fillClass = "bg-green-mid",
  className,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      className={cn("h-1 rounded-full bg-surface overflow-hidden", className)}
    >
      <div
        className={cn("h-full rounded-full transition-all", fillClass)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
