import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { cn } from "@/lib/utils";
import type { DashMeeting } from "@/db/queries/dashboard";

interface WeekCalendarProps {
  meetings: DashMeeting[];
  weekStart: Date;
}

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Meeting times are an ET wall-clock pinned to UTC, so match them to a (local)
// grid day by their UTC components.
function meetingOnLocalDay(m: Date, day: Date) {
  return (
    m.getUTCFullYear() === day.getFullYear() &&
    m.getUTCMonth() === day.getMonth() &&
    m.getUTCDate() === day.getDate()
  );
}

const TYPE_COLOR: Record<DashMeeting["type"], string> = {
  one_on_one: "bg-blue-bg text-blue-text",
  group: "bg-purple-bg text-purple-text",
  event: "bg-amber-bg text-amber-text",
  call: "bg-teal-bg text-teal-text",
};

export function WeekCalendar({ meetings, weekStart }: WeekCalendarProps) {
  const today = new Date();
  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  return (
    <DashCard>
      <SectionLabel icon={CalendarRange}>Week at a glance</SectionLabel>
      <div className="overflow-x-auto">
        <div
          className="grid min-w-[640px]"
          style={{ gridTemplateColumns: "44px repeat(5, 1fr)" }}
        >
          {/* Header row */}
          <div />
          {days.map((d, i) => {
            const isToday = isSameDay(d, today);
            return (
              <div
                key={`hdr-${i}`}
                className={cn(
                  "text-center pb-2 border-b",
                  isToday && "bg-blue-bg/40",
                )}
                style={{ borderColor: "var(--border-default)" }}
              >
                <div className="text-tiny text-text-tertiary font-medium">
                  {d.toLocaleDateString(undefined, { weekday: "short" })}
                </div>
                <div
                  className={cn(
                    "text-[14px] font-medium",
                    isToday ? "text-blue-text" : "text-text-primary",
                  )}
                >
                  {d.getDate()}
                </div>
              </div>
            );
          })}

          {/* Time rows */}
          {HOURS.map((h) => (
            <ContextRow
              key={`row-${h}`}
              hour={h}
              days={days}
              meetings={meetings}
              today={today}
            />
          ))}
        </div>
      </div>
    </DashCard>
  );
}

function ContextRow({
  hour,
  days,
  meetings,
  today,
}: {
  hour: number;
  days: Date[];
  meetings: DashMeeting[];
  today: Date;
}) {
  return (
    <>
      <div className="text-tiny text-text-tertiary text-right pr-2 pt-2 tabular-nums">
        {hour % 12 === 0 ? 12 : hour % 12}
        {hour < 12 ? "a" : "p"}
      </div>
      {days.map((d, di) => {
        const isToday = isSameDay(d, today);
        const slotMeetings = meetings.filter(
          (m) =>
            meetingOnLocalDay(m.scheduledAt, d) &&
            m.scheduledAt.getUTCHours() === hour,
        );
        return (
          <div
            key={`cell-${di}-${hour}`}
            className={cn(
              "border-b border-r min-h-[36px] p-1 space-y-0.5",
              di === 0 && "border-l",
              isToday && "bg-blue-bg/15",
            )}
            style={{ borderColor: "var(--border-default)" }}
          >
            {slotMeetings.map((m) => (
              <Link
                key={m.id}
                href={`/meetings/${m.id}`}
                className={cn(
                  "block truncate rounded px-1.5 py-0.5 text-tiny font-medium hover:opacity-80",
                  TYPE_COLOR[m.type],
                )}
                title={m.title}
              >
                {m.title}
              </Link>
            ))}
          </div>
        );
      })}
    </>
  );
}
