import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { cn } from "@/lib/utils";
import type { DashMeeting } from "@/db/queries/dashboard";
import { meetingDayKey } from "@/lib/date/meeting-time";

interface MonthCalendarProps {
  meetings: DashMeeting[];
  monthStart: Date;
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const TYPE_COLOR: Record<DashMeeting["type"], string> = {
  one_on_one: "bg-blue-bg text-blue-text",
  group: "bg-purple-bg text-purple-text",
  event: "bg-amber-bg text-amber-text",
  call: "bg-teal-bg text-teal-text",
};

export function MonthCalendar({ meetings, monthStart }: MonthCalendarProps) {
  const now = new Date();
  const todayKey = ymdLocal(now);
  const monthLabel = monthStart.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  // Build a map of date -> meetings. Meeting times are an ET wall-clock pinned
  // to UTC, so bucket by their UTC day (matches the local grid-cell keys, which
  // are local-midnight dates for each calendar day).
  const byDate = new Map<string, DashMeeting[]>();
  for (const m of meetings) {
    const k = meetingDayKey(m.scheduledAt);
    const arr = byDate.get(k) ?? [];
    arr.push(m);
    byDate.set(k, arr);
  }

  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const dayCount = lastDay.getDate();

  // Mon-first
  const offsetSunFirst = firstDay.getDay();
  const offsetMonFirst = (offsetSunFirst + 6) % 7;

  // Include leading days from prev month
  const cells: Array<{ date: Date; inMonth: boolean }> = [];
  for (let i = offsetMonFirst - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    cells.push({ date: d, inMonth: false });
  }
  for (let d = 1; d <= dayCount; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }
  // Trailing days to fill to a 6-row grid
  while (cells.length % 7 !== 0 || cells.length < 35) {
    const last = cells[cells.length - 1].date;
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    cells.push({ date: next, inMonth: next.getMonth() === month });
  }

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <DashCard>
      <SectionLabel icon={CalendarDays}>{monthLabel}</SectionLabel>

      <div className="grid grid-cols-7 gap-1">
        {dayNames.map((n) => (
          <div
            key={n}
            className="text-tiny font-medium text-text-tertiary pb-1 text-left pl-1"
          >
            {n}
          </div>
        ))}
        {cells.map((c, i) => {
          const k = ymdLocal(c.date);
          const isToday = k === todayKey;
          const dayMeetings = byDate.get(k) ?? [];
          return (
            <div
              key={i}
              className={cn(
                "min-h-[62px] rounded border p-1",
                !c.inMonth && "opacity-40",
                isToday && "border-blue-mid",
              )}
              style={{
                borderColor: isToday
                  ? "var(--blue-mid)"
                  : "var(--border-default)",
              }}
            >
              <div
                className={cn(
                  "text-tiny font-medium",
                  isToday
                    ? "text-blue-text"
                    : c.inMonth
                      ? "text-text-primary"
                      : "text-text-tertiary",
                )}
              >
                {c.date.getDate()}
              </div>
              <div className="mt-1 space-y-0.5">
                {dayMeetings.slice(0, 2).map((m) => (
                  <Link
                    key={m.id}
                    href={`/meetings/${m.id}`}
                    className={cn(
                      "block truncate rounded px-1 py-0.5 text-tiny font-medium hover:opacity-80",
                      TYPE_COLOR[m.type],
                    )}
                    title={m.title}
                  >
                    {m.title}
                  </Link>
                ))}
                {dayMeetings.length > 2 && (
                  <div className="px-1 text-tiny text-text-tertiary">
                    +{dayMeetings.length - 2}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </DashCard>
  );
}
