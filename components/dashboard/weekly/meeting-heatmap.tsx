import { Activity } from "lucide-react";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import type { DashMeeting } from "@/db/queries/dashboard";

interface MeetingHeatmapProps {
  meetings: DashMeeting[];
  weekStart: Date;
}

// Meeting times are an ET wall-clock pinned to UTC — match by UTC components.
function meetingOnLocalDay(m: Date, day: Date) {
  return (
    m.getUTCFullYear() === day.getFullYear() &&
    m.getUTCMonth() === day.getMonth() &&
    m.getUTCDate() === day.getDate()
  );
}

export function MeetingHeatmap({ meetings, weekStart }: MeetingHeatmapProps) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const counts = days.map(
    (d) => meetings.filter((m) => meetingOnLocalDay(m.scheduledAt, d)).length,
  );
  const max = Math.max(1, ...counts);

  return (
    <DashCard>
      <SectionLabel icon={Activity}>Meeting load</SectionLabel>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d, i) => {
          const count = counts[i];
          const intensity = count / max;
          return (
            <div
              key={i}
              className="rounded-md p-2 text-center"
              style={{
                background: count === 0
                  ? "var(--bg-surface)"
                  : `color-mix(in oklab, var(--purple-mid) ${Math.round(intensity * 75)}%, var(--bg-surface))`,
              }}
            >
              <div className="text-tiny text-text-tertiary font-medium">
                {d.toLocaleDateString(undefined, { weekday: "short" })}
              </div>
              <div
                className="text-[16px] font-medium mt-0.5"
                style={{
                  color: count === 0 ? "var(--text-tertiary)" : intensity > 0.4 ? "white" : "var(--text-primary)",
                }}
              >
                {count}
              </div>
            </div>
          );
        })}
      </div>
    </DashCard>
  );
}
