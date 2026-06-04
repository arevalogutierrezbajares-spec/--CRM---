"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { AlertTriangle, Ban, CalendarClock, ListTodo, ListChecks } from "lucide-react";
import { useItemDrawer } from "../item-drawer";
import type { DashActionItem, DashMeeting, DashTask } from "@/db/queries/dashboard";
import type { BlockedProject } from "@/db/queries/this-week";

function minsUntil(d: Date): number {
  return Math.round((new Date(d).getTime() - Date.now()) / 60000);
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
}: {
  actionItems: DashActionItem[];
  tasks: DashTask[];
  blocked: BlockedProject[];
  meetings: DashMeeting[];
}) {
  const drawer = useItemDrawer();
  const overdueAi = actionItems.filter((a) => a.isOverdue).slice(0, 4);
  const overdueTasks = tasks.filter((t) => t.isOverdue).slice(0, 4);
  const soonMeeting = meetings.find((m) => {
    const mm = minsUntil(m.scheduledAt);
    return mm >= -5 && mm <= 30;
  });

  const total = overdueAi.length + overdueTasks.length + blocked.length + (soonMeeting ? 1 : 0);
  if (total === 0) return null;

  return (
    <motion.div
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
              const m = minsUntil(soonMeeting.scheduledAt);
              return m <= 0 ? "Now" : `${m}m`;
            })()}: {soonMeeting.title}
          </Link>
        )}
        {overdueAi.map((a) => (
          <button key={a.id} type="button" onClick={() => drawer?.openItem("action_item", a.id)} className="flex items-center gap-1.5 text-left text-text-secondary hover:text-text-primary">
            <ListTodo size={13} className="text-[var(--red-text)]" />
            <span className="max-w-[220px] truncate">{a.title}</span>
          </button>
        ))}
        {overdueTasks.map((t) => (
          <button key={t.id} type="button" onClick={() => drawer?.openItem("milestone", t.id)} className="flex items-center gap-1.5 text-left text-text-secondary hover:text-text-primary">
            <ListChecks size={13} className="text-[var(--red-text)]" />
            <span className="max-w-[220px] truncate">{t.title}</span>
          </button>
        ))}
        {blocked.slice(0, 3).map((b) => (
          <Link key={b.id} href={`/projects/${b.id}`} className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary">
            <Ban size={13} className="text-[var(--amber-text)]" />
            <span className="max-w-[220px] truncate">{b.title} blocked</span>
          </Link>
        ))}
      </div>
    </motion.div>
  );
}
