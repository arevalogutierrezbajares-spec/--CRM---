"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Calendar } from "lucide-react";
import { WorkPriorityBadge } from "./priority-badge";
import { ThemeChips } from "./theme-chips";
import { setMilestoneStatusRich } from "@/app/(app)/work/actions";
import type { WorkTask } from "@/db/queries/work";

interface SprintColumnProps {
  status: "pending" | "in_progress" | "in_review" | "done";
  label: string;
  tasks: WorkTask[];
}

const NEXT_STATUS: Record<string, string | null> = {
  pending: "in_progress",
  in_progress: "in_review",
  in_review: "done",
  done: null,
};

function shortDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function SprintColumn({ status, label, tasks }: SprintColumnProps) {
  const [pending, startTransition] = useTransition();

  function advance(taskId: string) {
    const next = NEXT_STATUS[status];
    if (!next) return;
    startTransition(async () => {
      await setMilestoneStatusRich(
        taskId,
        next as "in_progress" | "in_review" | "done",
      );
    });
  }

  return (
    <section
      className="rounded-lg border bg-surface/30 p-2 space-y-2"
      style={{ borderColor: "var(--border-default)" }}
    >
      <div className="flex items-center justify-between px-1">
        <h3 className="text-label text-text-secondary">{label}</h3>
        <span className="text-tiny text-text-tertiary tabular-nums">
          {tasks.length}
        </span>
      </div>

      {tasks.length === 0 ? (
        <p className="text-tiny text-text-tertiary p-2">—</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <div
              key={t.id}
              className="rounded-md border bg-card p-2.5"
              style={{ borderColor: "var(--border-default)" }}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <Link
                  href={`/projects/${t.projectId}`}
                  className="text-[12.5px] font-medium text-text-primary line-clamp-2 hover:underline"
                >
                  {t.title}
                </Link>
                <WorkPriorityBadge priority={t.priority} />
              </div>

              {t.themes.length > 0 && (
                <div className="my-1.5">
                  <ThemeChips themes={t.themes} size="xs" />
                </div>
              )}

              <div className="flex items-center justify-between text-tiny text-text-tertiary">
                <span className="truncate max-w-[140px]">
                  {t.projectTitle}
                  {t.assigneeName && ` · ${t.assigneeName}`}
                </span>
                {t.dueDate && (
                  <span className="flex items-center gap-1 shrink-0">
                    <Calendar size={10} /> {shortDate(t.dueDate)}
                  </span>
                )}
              </div>

              {NEXT_STATUS[status] && (
                <button
                  type="button"
                  onClick={() => advance(t.id)}
                  disabled={pending}
                  className="mt-2 w-full rounded border px-2 py-0.5 text-tiny text-text-secondary hover:bg-surface hover:text-text-primary disabled:opacity-50 transition-colors"
                  style={{ borderColor: "var(--border-default)" }}
                >
                  → {label === "Todo" ? "Start" : label === "In progress" ? "Send for review" : "Mark done"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
