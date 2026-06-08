"use client";

import { CalendarDays } from "lucide-react";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { useItemDrawer } from "../item-drawer";
import type { DashMeeting } from "@/db/queries/dashboard";
import { formatMeetingTimeOnly, toEtWallMs } from "@/lib/date/meeting-time";

const ASSUMED_MIN = 60; // a meeting is "ongoing/upcoming" until ~60m after its start

/** Today's meetings as an ordered agenda (Teams/Meet-style): time · title, the
 *  next one highlighted with a countdown, past ones dimmed. Times render in ET
 *  and "now" is converted to the same ET wall-clock so the math lines up. nowMs
 *  is a server snapshot so the time math is hydration-stable. */
export function MeetingsAgenda({ meetings, nowMs }: { meetings: DashMeeting[]; nowMs: number }) {
  const drawer = useItemDrawer();
  const nowEt = toEtWallMs(nowMs);
  const sorted = [...meetings].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  const nextId = sorted.find((m) => m.scheduledAt.getTime() + ASSUMED_MIN * 60000 > nowEt)?.id ?? null;

  return (
    <DashCard className="p-2.5">
      <div className="flex items-center justify-between">
        <SectionLabel icon={CalendarDays} className="mb-1.5">Meetings today</SectionLabel>
        {sorted.length > 0 && <span className="text-tiny text-text-tertiary tabular-nums">{sorted.length}</span>}
      </div>

      {sorted.length === 0 ? (
        <p className="text-[12px] text-text-secondary">Nothing on the calendar.</p>
      ) : (
        <ol className="max-h-[152px] space-y-0.5 overflow-y-auto pr-1">
          {sorted.map((m) => {
            const startMs = m.scheduledAt.getTime();
            const mins = Math.round((startMs - nowEt) / 60000);
            const past = startMs + ASSUMED_MIN * 60000 <= nowEt;
            const isNext = m.id === nextId;
            const when = mins <= 0 ? "now" : mins < 60 ? `in ${mins}m` : `in ${Math.round(mins / 60)}h`;
            return (
              <li
                key={m.id}
                className={`flex min-h-[28px] items-center gap-2 rounded-md px-1.5 py-0.5 transition-colors hover:bg-surface ${isNext ? "bg-surface" : ""}`}
              >
                <span className="w-[46px] shrink-0 text-right text-tiny tabular-nums text-text-tertiary">
                  {formatMeetingTimeOnly(m.scheduledAt)}
                </span>
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${past ? "bg-[var(--text-faint,var(--text-tertiary))]" : isNext ? "bg-green-mid" : "bg-blue-mid"}`}
                />
                <button
                  type="button"
                  onClick={() => drawer?.openItem("meeting", m.id)}
                  className="min-w-0 flex-1 truncate self-stretch rounded-sm text-left outline-none transition-transform active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  title={m.title}
                >
                  <span className={`text-[12.5px] ${past ? "text-text-tertiary line-through" : "text-text-primary"}`}>
                    {m.title}
                  </span>
                </button>
                {isNext && !past && (
                  <span className="shrink-0 text-tiny font-medium text-[var(--green-text)]">{when}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </DashCard>
  );
}
