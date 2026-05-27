import { formatRelative } from "@/lib/utils";

function daysSince(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  const diffMs = Date.now() - d.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function LastTouchCell({ value }: { value: Date | string | null | undefined }) {
  const days = daysSince(value);
  let dotClass = "bg-[var(--muted-foreground)]/30";
  let textClass = "text-[var(--muted-foreground)]";
  let title = "Never contacted";

  if (days !== null && days >= 0) {
    if (days < 7) {
      dotClass = "bg-emerald-500";
      textClass = "text-emerald-700 dark:text-emerald-400";
      title = `Last touch ${days}d ago — fresh`;
    } else if (days < 30) {
      dotClass = "bg-amber-500";
      textClass = "text-amber-700 dark:text-amber-400";
      title = `Last touch ${days}d ago — getting stale`;
    } else {
      dotClass = "bg-red-500";
      textClass = "text-red-700 dark:text-red-400";
      title = `Last touch ${days}d ago — needs attention`;
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5" title={title}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      <span className={`text-xs ${textClass}`}>{formatRelative(value)}</span>
    </span>
  );
}
