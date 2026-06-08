"use client";

import Link from "next/link";
import { CalendarClock, Radio } from "lucide-react";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { DashBadge } from "../shared/badge";
import { useItemDrawer } from "../item-drawer";
import type { DashMeeting } from "@/db/queries/dashboard";
import { formatMeetingTimeOnly, toEtWallMs } from "@/lib/date/meeting-time";

interface MeetingsCardProps {
  meetings: DashMeeting[];
  scope: "today" | "week";
}

const TYPE_LABEL: Record<DashMeeting["type"], string> = {
  one_on_one: "1:1",
  group: "group",
  event: "event",
  call: "call",
};

// Meeting times are an ET wall-clock pinned to UTC, so read their UTC components.
function timeOnly(d: Date): string {
  return formatMeetingTimeOnly(d);
}

function dayShort(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function isLive(m: DashMeeting): boolean {
  // From 5 min before start through ~60 min after — compare in ET wall-clock.
  const delta = toEtWallMs(Date.now()) - m.scheduledAt.getTime();
  return delta >= -5 * 60_000 && delta <= 60 * 60_000;
}

export function MeetingsCard({ meetings, scope }: MeetingsCardProps) {
  const drawer = useItemDrawer();

  return (
    <DashCard>
      <SectionLabel icon={CalendarClock}>
        {scope === "today" ? "Meetings today" : "Meetings this week"}
      </SectionLabel>

      {meetings.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-text-secondary">
          No meetings {scope === "today" ? "today" : "this week"}.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {meetings.slice(0, 8).map((m) => {
            const live = isLive(m) && scope === "today";
            return (
              <li key={m.id} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-surface transition-colors">
                <div className="w-12 shrink-0 text-tiny font-medium text-text-secondary tabular-nums">
                  {scope === "today" ? timeOnly(m.scheduledAt) : dayShort(m.scheduledAt)}
                </div>
                {drawer ? (
                  <button type="button" onClick={() => drawer.openItem("meeting", m.id)} className="min-w-0 flex-1 text-left">
                    <div className="block text-[12.5px] text-text-primary truncate">{m.title}</div>
                    {m.attendeeNames.length > 0 && (
                      <div className="text-tiny text-text-tertiary truncate">
                        {m.attendeeNames.slice(0, 3).join(", ")}
                        {m.attendeeNames.length > 3 && ` +${m.attendeeNames.length - 3}`}
                      </div>
                    )}
                  </button>
                ) : (
                  <Link href={`/meetings/${m.id}`} className="min-w-0 flex-1">
                    <div className="block text-[12.5px] text-text-primary truncate hover:underline">{m.title}</div>
                    {m.attendeeNames.length > 0 && (
                      <div className="text-tiny text-text-tertiary truncate">
                        {m.attendeeNames.slice(0, 3).join(", ")}
                        {m.attendeeNames.length > 3 && ` +${m.attendeeNames.length - 3}`}
                      </div>
                    )}
                  </Link>
                )}
                <div className="flex items-center gap-1.5 shrink-0">
                  <DashBadge variant="neutral">{TYPE_LABEL[m.type]}</DashBadge>
                  {live && (
                    <Link
                      href={`/meetings/${m.id}?live=1`}
                      className="inline-flex items-center gap-1 rounded-full bg-red-bg px-1.5 py-0.5 text-tiny font-medium text-red-text hover:opacity-80"
                    >
                      <Radio size={10} />
                      Live
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </DashCard>
  );
}
