"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Square, StopCircle, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineNotes } from "@/components/meetings/inline-notes";

interface Attendee {
  id: string;
  name: string;
  organization: string | null;
  relationshipType: string;
}

interface LiveMeetingProps {
  meetingId: string;
  title: string;
  scheduledAt: Date;
  startedAt: Date | null;
  agenda: string | null;
  minutes: string | null;
  attendees: Attendee[];
  linkedProjectId: string | null;
}

export function LiveMeeting({
  meetingId,
  title,
  scheduledAt,
  startedAt: initialStartedAt,
  agenda,
  minutes,
  attendees,
  linkedProjectId,
}: LiveMeetingProps) {
  const router = useRouter();
  const [startedAt, setStartedAt] = useState<Date | null>(
    initialStartedAt,
  );
  const [elapsed, setElapsed] = useState(0);
  const [ending, setEnding] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Parse agenda into agenda items (non-empty lines)
  const agendaLines = (agenda ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const startTimer = useCallback((from: Date) => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - from.getTime()) / 1000));
    }, 1000);
  }, []);

  // Auto-start on mount if not started yet
  useEffect(() => {
    async function autoStart() {
      const res = await fetch(`/api/meetings/${meetingId}/live`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      if (res.ok) {
        const { ts } = await res.json();
        const d = new Date(ts);
        setStartedAt(d);
        startTimer(d);
      }
    }

    if (initialStartedAt) {
      startTimer(initialStartedAt);
    } else {
      autoStart();
    }

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleEnd() {
    setEnding(true);
    await fetch(`/api/meetings/${meetingId}/live`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "end" }),
    });
    router.push(`/meetings/${meetingId}`);
  }

  function toggleItem(idx: number) {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  const doneCount = checkedItems.size;
  const totalCount = agendaLines.length;

  return (
    <div className="space-y-4">
      {/* Live header bar */}
      <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <span className="text-sm font-medium text-red-600 dark:text-red-400">
            LIVE
          </span>
          <ElapsedTimer elapsed={elapsed} />
          {startedAt && (
            <span className="hidden text-xs text-[var(--muted-foreground)] sm:block">
              Started {startedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-red-500/40 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20 dark:text-red-400"
          onClick={handleEnd}
          disabled={ending}
        >
          <StopCircle className="h-4 w-4" />
          {ending ? "Ending…" : "End Meeting"}
        </Button>
      </div>

      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>

      {/* Split pane: agenda checklist + live notes */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Agenda checklist */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Agenda</CardTitle>
            {totalCount > 0 && (
              <Badge variant="outline" className="text-xs">
                {doneCount}/{totalCount} done
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {agendaLines.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                No agenda items. Add them in the Agenda field.
              </p>
            ) : (
              <ul className="space-y-2">
                {agendaLines.map((line, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => toggleItem(i)}
                      className="flex w-full items-start gap-2.5 rounded px-1 py-1 text-left text-sm transition-colors hover:bg-[var(--muted)]/40"
                    >
                      {checkedItems.has(i) ? (
                        <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                      ) : (
                        <Square className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
                      )}
                      <span
                        className={
                          checkedItems.has(i)
                            ? "line-through text-[var(--muted-foreground)]"
                            : ""
                        }
                      >
                        {line}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Attendees strip */}
            {attendees.length > 0 && (
              <div className="mt-4 border-t border-[var(--border)] pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  In this meeting
                </p>
                <ul className="space-y-1">
                  {attendees.map((a) => (
                    <li key={a.id} className="text-sm">
                      <span className="font-medium">{a.name}</span>
                      {a.organization && (
                        <span className="text-[var(--muted-foreground)]">
                          {" "}· {a.organization}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Live minutes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Minutes{" "}
              <span className="text-xs font-normal text-[var(--muted-foreground)]">
                — auto-saving
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InlineNotes
              meetingId={meetingId}
              field="minutes"
              initialValue={minutes}
              placeholder={"Take notes here. Use [ ] to mark action items.\nExample: [ ] Follow up on proposal"}
              showActionItems
              linkedProjectId={linkedProjectId}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ElapsedTimer({ elapsed }: { elapsed: number }) {
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const parts = h > 0
    ? [h, m, s].map((v) => String(v).padStart(2, "0"))
    : [m, s].map((v) => String(v).padStart(2, "0"));

  return (
    <span className="flex items-center gap-1 font-mono text-sm tabular-nums text-[var(--foreground)]">
      <Timer className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
      {parts.join(":")}
    </span>
  );
}
