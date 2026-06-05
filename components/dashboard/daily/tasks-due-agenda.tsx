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

/** Upcoming due tasks as a slim, scrollable agenda (overdue first, then by date)
 *  — the top-row sibling to the meetings agenda. Single-line rows; the full list
 *  scrolls inside a fixed height. Click a row to open its drawer. */
export function TasksDueAgenda({ tasks, tz }: { tasks: DashTask[]; tz: string }) {
  const drawer = useItemDrawer();
  const sorted = [...tasks].sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  return (
    <DashCard className="p-2.5">
      <div className="flex items-center justify-between">
        <SectionLabel icon={ListChecks} className="mb-1.5">Tasks due</SectionLabel>
        {sorted.length > 0 && <span className="text-tiny text-text-tertiary tabular-nums">{sorted.length}</span>}
      </div>

      {sorted.length === 0 ? (
        <p className="text-[12px] text-text-secondary">Nothing due.</p>
      ) : (
        <ol className="max-h-[152px] space-y-0.5 overflow-y-auto pr-1">
          {sorted.map((t) => (
            <li key={t.id} className="flex min-h-[28px] items-center gap-2 rounded-md px-1.5 py-0.5 transition-colors hover:bg-surface">
              <span className={`w-[46px] shrink-0 text-right text-tiny tabular-nums ${t.isOverdue ? "text-[var(--red-text)]" : "text-text-tertiary"}`}>
                {fmtDue(t.dueDate, tz)}
              </span>
              <span
                aria-hidden
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.isOverdue ? "bg-[var(--red-text)]" : t.status === "blocked" ? "bg-[var(--amber-text)]" : "bg-[var(--blue-text)]"}`}
              />
              <button
                type="button"
                onClick={() => drawer?.openItem("milestone", t.id)}
                className="min-w-0 flex-1 truncate self-stretch rounded-sm text-left text-[12.5px] text-text-primary outline-none transition-transform active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                title={`${t.title} · ${t.projectTitle}`}
              >
                {t.title}
              </button>
              {t.ownerName && (
                <span className="hidden shrink-0 truncate text-tiny text-text-tertiary sm:inline" title={`Owner: ${t.ownerName}`}>
                  {t.ownerName.split(/\s+/)[0]}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </DashCard>
  );
}
