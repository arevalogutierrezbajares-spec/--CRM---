import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { HealthBadge } from "@/components/ui/health-badge";
import { DashBadge } from "@/components/dashboard/shared/badge";
import { ProgressBar } from "@/components/dashboard/shared/progress-bar";
import type { ProjectListItem } from "@/db/queries/projects";

interface ProjectCardProps {
  project: ProjectListItem & {
    tagline?: string | null;
    summary?: string | null;
    coverEmoji?: string | null;
    coverColor?: string | null;
    primaryUrl?: string | null;
    statusText?: string | null;
  };
}

const STATUS_VARIANT: Record<
  "active" | "waiting" | "done" | "lost",
  "blue" | "amber" | "green" | "neutral"
> = {
  active: "blue",
  waiting: "amber",
  done: "green",
  lost: "neutral",
};

export function ProjectCard({ project: p }: ProjectCardProps) {
  const accent = p.coverColor ?? "var(--text-tertiary)";
  const progressPct =
    p.milestoneOpenCount + p.milestoneOverdueCount === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            100,
            100 -
              Math.round(
                (p.milestoneOpenCount /
                  Math.max(1, p.milestoneOpenCount + 5)) *
                  100,
              ),
          ),
        );

  return (
    <Link
      href={`/projects/${p.id}`}
      className="group block rounded-xl border bg-card overflow-hidden hover:bg-surface/50 transition-colors"
      style={{ borderColor: "var(--border-default)" }}
    >
      {/* Cover */}
      <div
        className="relative px-4 py-5 flex items-center justify-between"
        style={{
          background: `linear-gradient(135deg, color-mix(in oklab, ${accent} 18%, var(--bg-card)) 0%, var(--bg-card) 100%)`,
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="grid h-12 w-12 place-items-center rounded-lg text-[26px] shrink-0"
            style={{
              background: `color-mix(in oklab, ${accent} 22%, var(--bg-card))`,
              border: `1px solid color-mix(in oklab, ${accent} 50%, transparent)`,
            }}
          >
            {p.coverEmoji ?? "📁"}
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-medium text-text-primary truncate">
              {p.title}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <DashBadge variant={STATUS_VARIANT[p.status]}>{p.status}</DashBadge>
              <HealthBadge health={p.computedHealth} short />
            </div>
          </div>
        </div>
        {p.primaryUrl && (
          <a
            href={p.primaryUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="grid h-7 w-7 place-items-center rounded text-text-tertiary hover:bg-card hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Open production URL"
            title={p.primaryUrl}
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2">
        {p.tagline && (
          <p className="text-[12.5px] text-text-secondary line-clamp-2">
            {p.tagline}
          </p>
        )}
        {p.statusText && (
          <p className="text-tiny text-text-tertiary font-mono">
            {p.statusText}
          </p>
        )}

        <ProgressBar pct={progressPct} className="mt-2" />

        <div className="flex items-center justify-between text-tiny text-text-tertiary tabular-nums">
          <span>
            {p.milestoneOpenCount} open
            {p.milestoneOverdueCount > 0 && (
              <span className="text-red-text">
                {" "}· {p.milestoneOverdueCount} overdue
              </span>
            )}
          </span>
          {p.dueDate && (
            <span>
              due{" "}
              {new Date(p.dueDate).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
