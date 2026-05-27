import { Calendar } from "lucide-react";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { cn } from "@/lib/utils";

interface MiniCalendarProps {
  /** ISO dates (YYYY-MM-DD) that have events */
  eventDays: string[];
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function MiniCalendar({ eventDays }: MiniCalendarProps) {
  const now = new Date();
  const todayKey = ymdLocal(now);
  const monthLabel = now.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const eventSet = new Set(eventDays);

  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const dayCount = lastDay.getDate();

  // Mon-first grid offset
  const offsetSunFirst = firstDay.getDay(); // 0..6
  const offsetMonFirst = (offsetSunFirst + 6) % 7;

  const cells: Array<{ day: number | null; key: string; isToday: boolean; hasEvent: boolean }> = [];
  for (let i = 0; i < offsetMonFirst; i++) {
    cells.push({ day: null, key: `pad-${i}`, isToday: false, hasEvent: false });
  }
  for (let d = 1; d <= dayCount; d++) {
    const k = ymdLocal(new Date(now.getFullYear(), now.getMonth(), d));
    cells.push({
      day: d,
      key: k,
      isToday: k === todayKey,
      hasEvent: eventSet.has(k),
    });
  }

  const dayNames = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <DashCard>
      <SectionLabel icon={Calendar}>{monthLabel}</SectionLabel>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {dayNames.map((n, i) => (
          <div
            key={`hd-${i}`}
            className="text-tiny text-text-tertiary font-medium"
          >
            {n}
          </div>
        ))}
        {cells.map((c) => (
          <div key={c.key} className="aspect-square grid place-items-center">
            {c.day === null ? null : (
              <div
                className={cn(
                  "relative grid h-6 w-6 place-items-center rounded-md text-[11px]",
                  c.isToday
                    ? "bg-blue-mid text-white font-medium"
                    : c.hasEvent
                      ? "text-text-primary font-medium"
                      : "text-text-secondary",
                )}
              >
                {c.day}
                {c.hasEvent && !c.isToday && (
                  <span
                    className="absolute -bottom-0.5 h-1 w-1 rounded-full"
                    style={{ background: "var(--blue-mid)" }}
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </DashCard>
  );
}
