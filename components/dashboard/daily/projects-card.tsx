import Link from "next/link";
import { Folder } from "lucide-react";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { DashBadge, type BadgeVariant } from "../shared/badge";
import { ProgressBar } from "../shared/progress-bar";
import type { DashProject } from "@/db/queries/dashboard";

interface ProjectsCardProps {
  projects: DashProject[];
}

const HEALTH_BADGE: Record<
  DashProject["health"],
  { variant: BadgeVariant; label: string; fillClass: string }
> = {
  green: { variant: "green", label: "On track", fillClass: "bg-green-mid" },
  amber: { variant: "amber", label: "Watch", fillClass: "bg-amber-mid" },
  red: { variant: "red", label: "Behind", fillClass: "bg-red-mid" },
};

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function ProjectsCard({ projects }: ProjectsCardProps) {
  return (
    <DashCard>
      <SectionLabel
        icon={Folder}
        right={
          <Link
            href="/projects"
            className="text-tiny text-text-secondary hover:text-text-primary"
          >
            View all
          </Link>
        }
      >
        Active projects
      </SectionLabel>

      {projects.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-text-secondary">
          No active projects yet.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const badge = HEALTH_BADGE[p.health];
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="block rounded-md border bg-card p-2.5 hover:bg-surface transition-colors"
                style={{ borderColor: "var(--border-default)" }}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="text-[12.5px] font-medium text-text-primary truncate">
                    {p.title}
                  </div>
                  <DashBadge variant={badge.variant}>{badge.label}</DashBadge>
                </div>
                <ProgressBar
                  pct={p.progressPct}
                  fillClass={badge.fillClass}
                  className="my-1.5"
                />
                <div className="flex items-center justify-between text-tiny text-text-tertiary">
                  <span>
                    {p.progressPct}% · {p.openTasks} open
                  </span>
                  {p.nearestTaskDueDate && (
                    <span>due {shortDate(p.nearestTaskDueDate)}</span>
                  )}
                </div>
                {p.nearestTaskTitle && (
                  <div className="mt-1 text-tiny text-text-secondary truncate">
                    → {p.nearestTaskTitle}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </DashCard>
  );
}
