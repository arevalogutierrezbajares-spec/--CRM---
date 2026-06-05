"use client";

import { CalendarDays } from "lucide-react";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { useItemDrawer } from "../item-drawer";
import type { DashMeeting } from "@/db/queries/dashboard";

const ASSUMED_MIN = 60; // a meeting is "ongoing/upcoming" until ~60m after its start

function fmtTime(at: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(at);
  } catch {
    return "";
  }
}

/** Today's meetings as an ordered agenda (Teams/Meet-style): time · title, the
 *  next one highlighted with a countdown, past ones dimmed. nowMs is a server
 *  snapshot so the time math is hydration-stable. */
export function MeetingsAgenda({ meetings, nowMs, tz }: { meetings: DashMeeting[]; nowMs: number; tz: string }) {
  const drawer = useItemDrawer();
  const sorted = [...meetings].sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  const nextId = sorted.find((m) => m.scheduledAt.getTime() + ASSUMED_MIN * 60000 > nowMs)?.id ?? null;

  return (
    <DashCard>
      <div className="flex items-center justify-between">
        <SectionLabel icon={CalendarDays}>Meetings today</SectionLabel>
        {sorted.length > 0 && <span className="text-tiny text-text-tertiary tabular-nums">{sorted.length}</span>}
      </div>

      {sorted.length === 0 ? (
        <p className="mt-2 text-[12px] text-text-secondary">Nothing on the calendar.</p>
      ) : (
        <ol className="mt-1.5 space-y-0.5">
          {sorted.slice(0, 5).map((m) => {
            const startMs = m.scheduledAt.getTime();
            const mins = Math.round((startMs - nowMs) / 60000);
            const past = startMs + ASSUMED_MIN * 60000 <= nowMs;
            const isNext = m.id === nextId;
            const when = mins <= 0 ? "now" : mins < 60 ? `in ${mins}m` : `in ${Math.round(mins / 60)}h`;
            return (
              <li
                key={m.id}
                className={`flex items-center gap-2 rounded px-1.5 py-1 ${isNext ? "bg-surface" : ""}`}
              >
                <span className="w-[52px] shrink-0 text-right text-tiny tabular-nums text-text-tertiary">
                  {fmtTime(m.scheduledAt, tz)}
                </span>
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${past ? "bg-[var(--text-faint,var(--text-tertiary))]" : isNext ? "bg-green-mid" : "bg-blue-mid"}`}
                />
                <button
                  type="button"
                  onClick={() => drawer?.openItem("meeting", m.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className={`block truncate text-[12.5px] ${past ? "text-text-tertiary line-through" : "text-text-primary"}`}>
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
      {sorted.length > 5 && <p className="mt-1 text-tiny text-text-tertiary">+{sorted.length - 5} more</p>}
    </DashCard>
  );
}
