import { cn } from "@/lib/utils";
import type { DensityCell } from "@/db/queries/density";

/**
 * GitHub-style activity heatmap. 13 weeks × 7 days. Top of each column is
 * Sunday. Quintile scale based on the max count across the window.
 */
export function Heatmap({
  cells,
  className,
}: {
  cells: DensityCell[];
  className?: string;
}) {
  if (cells.length === 0) return null;

  const max = Math.max(...cells.map((c) => c.count), 1);

  // Bucket into weeks (cols) × days (rows). We need to pad the first column
  // with empty cells until we hit a Sunday.
  const firstDate = new Date(cells[0].date + "T00:00:00");
  const pad = firstDate.getDay(); // 0..6 (Sun..Sat)
  const padded: (DensityCell | null)[] = [
    ...Array.from({ length: pad }, () => null),
    ...cells,
  ];
  const weeks: (DensityCell | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7));
  }

  const total = cells.reduce((s, c) => s + c.count, 0);
  const active = cells.filter((c) => c.count > 0).length;

  return (
    <div className={cn("space-y-3", className)}>
      <div
        className="flex gap-1 overflow-x-auto pb-1"
        role="img"
        aria-label={`Touch density heatmap. ${total} touches across ${active} active day${active === 1 ? "" : "s"} in the last ${cells.length} days. Peak day: ${max}.`}
      >
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {Array.from({ length: 7 }, (_, di) => {
              const c = week[di];
              if (!c) return <div key={di} className="h-3 w-3" />;
              const intensity = bucket(c.count, max);
              return (
                <div
                  key={di}
                  title={`${c.date} · ${c.count} touch${c.count === 1 ? "" : "es"}`}
                  className={cn(
                    "h-3 w-3 rounded-[2px] transition-colors",
                    intensityClass(intensity),
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted-foreground)]">
        <span>
          {total} touch{total === 1 ? "" : "es"} · {active} active day
          {active === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-1.5" aria-hidden>
          <span>less</span>
          {([0, 1, 2, 3, 4] as const).map((lvl) => (
            <span
              key={lvl}
              className={cn(
                "inline-block h-3 w-3 rounded-[2px]",
                intensityClass(lvl),
              )}
            />
          ))}
          <span>more</span>
        </div>
      </div>
    </div>
  );
}

function bucket(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  const ratio = count / max;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}

function intensityClass(level: 0 | 1 | 2 | 3 | 4): string {
  switch (level) {
    case 0:
      return "bg-[var(--muted)]/40";
    case 1:
      return "bg-[var(--health-green)]/25";
    case 2:
      return "bg-[var(--health-green)]/45";
    case 3:
      return "bg-[var(--health-green)]/70";
    case 4:
      return "bg-[var(--health-green)]";
  }
}
