"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { AlertTriangle, Ban, CalendarClock, ListTodo, ListChecks } from "lucide-react";
import { useItemDrawer } from "../item-drawer";
import type { DashActionItem, DashMeeting, DashTask } from "@/db/queries/dashboard";
import type { BlockedProject } from "@/db/queries/this-week";

// `nowMs` is a server-rendered snapshot passed in (not Date.now() at render),
// so the time math is identical on the server and at hydration — no mismatch.
function minsUntil(d: Date, nowMs: number): number {
  return Math.round((new Date(d).getTime() - nowMs) / 60000);
}

/**
 * "Needs you now" — the urgent triage lane pinned to the top of Home: overdue
 * action items + overdue tasks + blocked projects + an imminent meeting. Only
 * renders when something actually needs attention. Items open the drawer inline.
 */
export function NeedsYouNow({
  actionItems,
  tasks,
  blocked,
  meetings,
  nowMs,
}: {
  actionItems: DashActionItem[];
  tasks: DashTask[];
  blocked: BlockedProject[];
  meetings: DashMeeting[];
  nowMs: number;
}) {
  const drawer = useItemDrawer();

  const overdueAi = actionItems.filter((a) => a.isOverdue).slice(0, 4);
  const overdueTasks = tasks.filter((t) => t.isOverdue).slice(0, 4);
  const blockedShown = blocked.slice(0, 3);
  const soonMeeting = meetings.find((m) => {
    const mm = minsUntil(m.scheduledAt, nowMs);
    return mm >= -5 && mm <= 30;
  });

  // Count reflects exactly what's rendered (capped), so the header never claims
  // more than the chips show.
  const total =
    overdueAi.length + overdueTasks.length + blockedShown.length + (soonMeeting ? 1 : 0);
  if (total === 0) return null;

  return (
    <motion.div
      role="region"
      aria-label={`Needs you now — ${total} item${total === 1 ? "" : "s"}`}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-[var(--red-mid,rgba(139,32,32,0.3))] bg-[var(--red-bg,rgba(139,32,32,0.06))] px-4 py-3"
    >
      <div className="mb-2 flex items-center gap-1.5">
        <AlertTriangle size={14} className="text-[var(--red-text)]" />
        <span className="text-[13px] font-semibold text-[var(--red-text)]">Needs you now</span>
        <span className="text-tiny text-text-tertiary">· {total}</span>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px]">
        {soonMeeting && (
          <Link href={`/meetings/${soonMeeting.id}`} className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary">
            <CalendarClock size={13} className="text-[var(--amber-text)]" />
            {(() => {
              const m = minsUntil(soonMeeting.scheduledAt, nowMs);
              return m <= 0 ? "Now" : `${m}m`;
            })()}: {soonMeeting.title}
          </Link>
        )}
        {overdueAi.map((a) => (
          <button key={a.id} type="button" aria-label={`Overdue action item: ${a.title}`} onClick={() => drawer?.openItem("action_item", a.id)} className="flex items-center gap-1.5 text-left text-text-secondary hover:text-text-primary">
            <ListTodo size={13} className="text-[var(--red-text)]" />
            <span className="max-w-[220px] truncate">{a.title}</span>
          </button>
        ))}
        {overdueTasks.map((t) => (
          <button key={t.id} type="button" aria-label={`Overdue task: ${t.title}`} onClick={() => drawer?.openItem("milestone", t.id)} className="flex items-center gap-1.5 text-left text-text-secondary hover:text-text-primary">
            <ListChecks size={13} className="text-[var(--red-text)]" />
            <span className="max-w-[220px] truncate">{t.title}</span>
          </button>
        ))}
        {blockedShown.map((b) => (
          <Link key={b.id} href={`/projects/${b.id}`} className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary">
            <Ban size={13} className="text-[var(--amber-text)]" />
            <span className="max-w-[220px] truncate">{b.title} blocked</span>
          </Link>
        ))}
      </div>
    </motion.div>
  );
}
