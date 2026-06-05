"use client";

import { ListChecks } from "lucide-react";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { useItemDrawer } from "../item-drawer";
import type { DashTask } from "@/db/queries/dashboard";

function fmtDue(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: tz, month: "short", day: "numeric" }).format(new Date(iso));
  } catch {
    return "";
  }
}

/** Upcoming due tasks as a compact agenda (overdue first, then by date) — the
 *  top-row sibling to the meetings agenda. Click a row to open its drawer. */
export function TasksDueAgenda({ tasks, tz }: { tasks: DashTask[]; tz: string }) {
  const drawer = useItemDrawer();
  const sorted = [...tasks].sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  return (
    <DashCard>
      <div className="flex items-center justify-between">
        <SectionLabel icon={ListChecks}>Tasks due</SectionLabel>
        {sorted.length > 0 && <span className="text-tiny text-text-tertiary tabular-nums">{sorted.length}</span>}
      </div>

      {sorted.length === 0 ? (
        <p className="mt-2 text-[12px] text-text-secondary">Nothing due.</p>
      ) : (
        <ol className="mt-1.5 space-y-0.5">
          {sorted.slice(0, 5).map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-surface">
              <span className={`w-[52px] shrink-0 text-right text-tiny tabular-nums ${t.isOverdue ? "text-[var(--red-text)]" : "text-text-tertiary"}`}>
                {fmtDue(t.dueDate, tz)}
              </span>
              <span
                aria-hidden
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.isOverdue ? "bg-[var(--red-text)]" : t.status === "blocked" ? "bg-[var(--amber-text)]" : "bg-[var(--blue-text)]"}`}
              />
              <button type="button" onClick={() => drawer?.openItem("milestone", t.id)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[12.5px] text-text-primary">{t.title}</span>
                <span className="block truncate text-tiny text-text-tertiary">{t.projectTitle}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {sorted.length > 5 && <p className="mt-1 text-tiny text-text-tertiary">+{sorted.length - 5} more</p>}
    </DashCard>
  );
}
