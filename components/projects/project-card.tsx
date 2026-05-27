"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Briefcase,
  Code,
  DollarSign,
  ExternalLink,
  FolderOpen,
  Megaphone,
  Palette,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HealthBadge } from "@/components/ui/health-badge";
import { DashBadge } from "@/components/dashboard/shared/badge";
import { ProgressBar } from "@/components/dashboard/shared/progress-bar";
import type { ProjectListItem } from "@/db/queries/projects";

interface ProjectCardProps {
  project: ProjectListItem;
  variant?: "featured" | "default";
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

const CATEGORY_META: Record<
  string,
  { label: string; icon: LucideIcon; color: string }
> = {
  business: { label: "Business", icon: Briefcase, color: "var(--green-text)" },
  marketing: { label: "Marketing", icon: Megaphone, color: "var(--red-text)" },
  tech: { label: "Tech", icon: Code, color: "var(--blue-text)" },
  ops: { label: "Ops", icon: Wrench, color: "var(--amber-text)" },
  design: { label: "Design", icon: Palette, color: "var(--purple-text)" },
  finance: { label: "Finance", icon: DollarSign, color: "var(--teal-text)" },
  other: { label: "Other", icon: FolderOpen, color: "var(--text-secondary)" },
};

const CATEGORY_ORDER = [
  "business",
  "marketing",
  "tech",
  "ops",
  "design",
  "finance",
  "other",
];

export function ProjectCard({ project: p, variant = "default" }: ProjectCardProps) {
  const [hovered, setHovered] = useState(false);
  const accent = p.coverColor ?? "var(--text-tertiary)";
  const isFeatured = variant === "featured";

  const objectives = (p.objectives ?? []) as string[];
  const totalLinks = Object.values(p.linkPreview ?? {}).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link
        href={`/projects/${p.id}`}
        className={cn(
          "group block rounded-xl border bg-card overflow-hidden hover:shadow-lg transition-all relative",
          isFeatured && "ring-1 ring-blue-mid/10",
        )}
        style={{ borderColor: "var(--border-default)" }}
      >
        {/* Cover band */}
        <div
          className={cn(
            "relative flex items-center gap-4",
            isFeatured ? "px-6 py-6" : "px-4 py-5",
          )}
          style={{
            background: `linear-gradient(135deg, color-mix(in oklab, ${accent} 18%, var(--bg-card)) 0%, var(--bg-card) 100%)`,
            borderBottom: "1px solid var(--border-default)",
          }}
        >
          <ProjectAvatar project={p} large={isFeatured} accent={accent} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                className={cn(
                  "font-medium text-text-primary truncate",
                  isFeatured ? "text-[18px]" : "text-[14px]",
                )}
              >
                {p.title}
              </h3>
              {p.status !== "active" && (
                <DashBadge variant={STATUS_VARIANT[p.status]}>
                  {p.status}
                </DashBadge>
              )}
              <HealthBadge health={p.computedHealth} short />
            </div>
            {p.tagline && (
              <p
                className={cn(
                  "text-text-secondary mt-1",
                  isFeatured ? "text-[13px]" : "text-[12.5px] line-clamp-2",
                )}
              >
                {p.tagline}
              </p>
            )}
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
        <div
          className={cn(
            isFeatured ? "px-6 py-4" : "px-4 py-3",
            "space-y-3",
          )}
        >
          {p.statusText && (
            <p className="text-tiny text-text-tertiary font-mono line-clamp-1">
              {p.statusText}
            </p>
          )}

          {/* Objectives */}
          {objectives.length > 0 && (
            <div>
              <p className="text-label text-text-tertiary mb-1.5">
                High-level objectives
              </p>
              <ul className="space-y-1">
                {objectives.slice(0, isFeatured ? 5 : 3).map((o, i) => (
                  <li
                    key={i}
                    className={cn(
                      "flex items-start gap-1.5 text-text-secondary",
                      isFeatured ? "text-[12.5px]" : "text-[11.5px]",
                    )}
                  >
                    <span
                      className="mt-1.5 h-1 w-1 rounded-full shrink-0"
                      style={{ background: accent }}
                    />
                    <span className="line-clamp-1">{o}</span>
                  </li>
                ))}
                {objectives.length > (isFeatured ? 5 : 3) && (
                  <li className="text-tiny text-text-tertiary pl-2.5">
                    +{objectives.length - (isFeatured ? 5 : 3)} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Progress + meta footer */}
          <div className="space-y-1.5">
            <ProgressBar
              pct={p.milestoneProgressPct}
              fillClass="bg-green-mid"
            />
            <div className="flex items-center justify-between text-tiny text-text-tertiary tabular-nums">
              <span>
                {p.milestoneProgressPct}% · {p.milestoneDoneCount}/
                {p.milestoneTotalCount} done
              </span>
              <span className="flex items-center gap-1">
                {totalLinks > 0 && (
                  <span className="inline-flex items-center gap-0.5">
                    <FolderOpen size={10} />
                    {totalLinks}
                  </span>
                )}
                {p.milestoneOverdueCount > 0 && (
                  <span className="text-red-text">
                    · {p.milestoneOverdueCount} overdue
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
      </Link>

      {/* Hover popover: folder structure of links */}
      {hovered && totalLinks > 0 && (
        <div
          className="absolute z-30 top-full mt-1.5 left-0 right-0 rounded-lg border bg-card shadow-xl overflow-hidden"
          style={{ borderColor: "var(--border-default)" }}
        >
          <div
            className="px-3 py-1.5 border-b text-tiny text-text-tertiary uppercase tracking-wider"
            style={{ borderColor: "var(--border-default)" }}
          >
            <FolderOpen size={11} className="inline mr-1.5" />
            {p.title} · materials & links
          </div>
          <div className="max-h-[320px] overflow-y-auto p-2.5 space-y-2.5">
            {CATEGORY_ORDER.filter(
              (c) => (p.linkPreview[c]?.length ?? 0) > 0,
            ).map((cat) => {
              const meta = CATEGORY_META[cat];
              const items = p.linkPreview[cat] ?? [];
              const Icon = meta.icon;
              return (
                <FolderBlock
                  key={cat}
                  icon={Icon}
                  label={meta.label}
                  color={meta.color}
                  items={items}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectAvatar({
  project: p,
  large,
  accent,
}: {
  project: ProjectListItem;
  large: boolean;
  accent: string;
}) {
  const size = large ? 64 : 48;
  const textSize = large ? "text-[34px]" : "text-[26px]";
  if (p.logoUrl) {
    return (
      <div
        className="shrink-0 grid place-items-center rounded-xl overflow-hidden"
        style={{
          width: size,
          height: size,
          background: `color-mix(in oklab, ${accent} 22%, var(--bg-card))`,
          border: `1px solid color-mix(in oklab, ${accent} 50%, transparent)`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={p.logoUrl}
          alt={`${p.title} logo`}
          width={size - 16}
          height={size - 16}
          className="object-contain"
        />
      </div>
    );
  }
  return (
    <div
      className={`shrink-0 grid place-items-center rounded-xl ${textSize}`}
      style={{
        width: size,
        height: size,
        background: `color-mix(in oklab, ${accent} 22%, var(--bg-card))`,
        border: `1px solid color-mix(in oklab, ${accent} 50%, transparent)`,
      }}
    >
      {p.coverEmoji ?? "📁"}
    </div>
  );
}

function FolderBlock({
  icon: Icon,
  label,
  color,
  items,
}: {
  icon: LucideIcon;
  label: string;
  color: string;
  items: string[];
}) {
  return (
    <div>
      <div
        className="flex items-center gap-1.5 text-[11.5px] font-medium pb-0.5"
        style={{ color }}
      >
        <Icon size={11} />
        <span>{label}</span>
        <span className="text-text-tertiary opacity-60 tabular-nums font-normal">
          {items.length}
        </span>
      </div>
      <ul
        className="space-y-0.5 pl-3 border-l ml-1.5"
        style={{
          borderColor: `color-mix(in oklab, ${color} 30%, transparent)`,
        }}
      >
        {items.slice(0, 6).map((it, i) => (
          <li
            key={i}
            className="text-tiny text-text-secondary truncate"
            title={it}
          >
            └ {it}
          </li>
        ))}
        {items.length > 6 && (
          <li className="text-tiny text-text-tertiary italic pl-3">
            +{items.length - 6} more…
          </li>
        )}
      </ul>
    </div>
  );
}
