import Link from "next/link";
import { CheckCircle2, ListChecks } from "lucide-react";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { DashBadge, type BadgeVariant } from "../shared/badge";
import type { DashTask } from "@/db/queries/dashboard";

interface TasksCardProps {
  tasks: DashTask[];
  scope: "today" | "week" | "month";
}

function scopeLabel(scope: TasksCardProps["scope"]): string {
  return scope === "today"
    ? "Tasks today"
    : scope === "week"
      ? "Tasks this week"
      : "Tasks this month";
}

function bucketBadge(task: DashTask): {
  label: string;
  variant: BadgeVariant;
} {
  if (task.isOverdue) return { label: "Overdue", variant: "red" };
  if (task.status === "blocked") return { label: "Blocked", variant: "amber" };
  return { label: "Open", variant: "blue" };
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TasksCard({ tasks, scope }: TasksCardProps) {
  return (
    <DashCard>
      <SectionLabel icon={ListChecks}>{scopeLabel(scope)}</SectionLabel>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-6 text-center">
          <CheckCircle2 size={20} className="text-green-mid" />
          <p className="text-[12px] text-text-secondary">
            Nothing due {scope === "today" ? "today" : `this ${scope}`}.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {tasks.slice(0, 8).map((t) => {
            const badge = bucketBadge(t);
            return (
              <li
                key={t.id}
                className="flex items-start gap-2 group rounded px-1 py-1 hover:bg-surface transition-colors"
              >
                <input
                  type="checkbox"
                  aria-label={`Complete ${t.title}`}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-green-mid"
                  disabled
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/projects/${t.projectId}`}
                    className="block text-[12.5px] text-text-primary truncate hover:underline"
                  >
                    {t.title}
                  </Link>
                  <div className="text-tiny text-text-tertiary truncate">
                    {t.projectTitle} · {shortDate(t.dueDate)}
                  </div>
                </div>
                <DashBadge variant={badge.variant}>{badge.label}</DashBadge>
              </li>
            );
          })}
        </ul>
      )}

      {tasks.length > 8 && (
        <p className="mt-2 text-tiny text-text-tertiary">
          +{tasks.length - 8} more
        </p>
      )}
    </DashCard>
  );
}
