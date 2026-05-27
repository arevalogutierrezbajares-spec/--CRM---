"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

interface SectionNavProps {
  sections: Array<{
    sectionKey: string;
    sectionName: string;
    count: number;
    active: number;
  }>;
  totalCount: number;
  totalActive: number;
}

function buildHref(
  sp: URLSearchParams,
  key: string,
  value: string | null,
): string {
  const next = new URLSearchParams(sp.toString());
  if (value === null) next.delete(key);
  else next.set(key, value);
  const q = next.toString();
  return q ? `/overlord?${q}` : "/overlord";
}

export function SectionNav({
  sections,
  totalCount,
  totalActive,
}: SectionNavProps) {
  const sp = useSearchParams();
  const current = sp.get("section");

  return (
    <div
      className="flex items-start gap-1 overflow-x-auto pb-1 border-b"
      style={{ borderColor: "var(--border-default)" }}
    >
      <Pill
        href={buildHref(sp, "section", null)}
        active={!current}
        label="All"
        count={totalActive}
        total={totalCount}
      />
      {sections.map((s) => (
        <Pill
          key={s.sectionKey}
          href={buildHref(sp, "section", s.sectionKey)}
          active={current === s.sectionKey}
          label={s.sectionName}
          count={s.active}
          total={s.count}
        />
      ))}
    </div>
  );
}

interface FilterChipsProps {
  priorityCounts: Record<string, number>;
  agents: Array<{ agent: string; count: number }>;
}

export function OverlordFilterChips({
  priorityCounts,
  agents,
}: FilterChipsProps) {
  const sp = useSearchParams();
  const currentPriority = sp.get("priority");
  const currentAgent = sp.get("agent");

  const priorities = ["NOW", "NEXT", "LATER", "BACKLOG"] as const;
  const priorityColor: Record<string, string> = {
    NOW: "var(--red-mid)",
    NEXT: "var(--amber-mid)",
    LATER: "var(--blue-mid)",
    BACKLOG: "var(--text-tertiary)",
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-tiny text-text-tertiary font-medium uppercase tracking-wider min-w-[80px]">
          Priority
        </span>
        <Chip
          href={buildHref(sp, "priority", null)}
          active={!currentPriority}
          label="All"
        />
        {priorities.map((p) => {
          const c = priorityCounts[p] ?? 0;
          if (c === 0) return null;
          return (
            <Chip
              key={p}
              href={buildHref(sp, "priority", p)}
              active={currentPriority === p}
              label={p}
              color={priorityColor[p]}
              count={c}
            />
          );
        })}
      </div>

      {agents.length > 0 && (
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-tiny text-text-tertiary font-medium uppercase tracking-wider min-w-[80px]">
            Agent
          </span>
          <Chip
            href={buildHref(sp, "agent", null)}
            active={!currentAgent}
            label="All"
          />
          {agents.slice(0, 12).map((a) => (
            <Chip
              key={a.agent}
              href={buildHref(sp, "agent", a.agent)}
              active={currentAgent === a.agent}
              label={a.agent}
              count={a.count}
            />
          ))}
        </div>
      )}

      {(currentPriority || currentAgent) && (
        <Link
          href={buildHref(
            buildHref(sp, "priority", null) === "/overlord"
              ? new URLSearchParams()
              : new URLSearchParams(buildHref(sp, "priority", null).split("?")[1]),
            "agent",
            null,
          )}
          className="text-tiny text-text-secondary hover:text-text-primary"
        >
          Clear filters
        </Link>
      )}
    </div>
  );
}

function Pill({
  href,
  active,
  label,
  count,
  total,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  total: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "shrink-0 rounded-md px-2.5 py-1 text-[12px] transition-colors",
        active
          ? "font-medium"
          : "bg-surface text-text-secondary hover:bg-card hover:text-text-primary",
      )}
      style={
        active
          ? { background: "var(--text-primary)", color: "var(--bg-card)" }
          : {}
      }
    >
      <span>{label}</span>
      <span className="ml-1.5 text-tiny opacity-70 tabular-nums">
        {count}/{total}
      </span>
    </Link>
  );
}

function Chip({
  href,
  active,
  label,
  count,
  color,
}: {
  href: string;
  active: boolean;
  label: string;
  count?: number;
  color?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-tiny transition-colors",
        active
          ? "font-medium"
          : "text-text-secondary hover:text-text-primary hover:bg-surface",
      )}
      style={
        active
          ? color
            ? {
                background: `color-mix(in oklab, ${color} 12%, transparent)`,
                color,
                borderColor: color,
              }
            : {
                background: "var(--text-primary)",
                color: "var(--bg-card)",
                borderColor: "var(--text-primary)",
              }
          : { borderColor: "var(--border-default)" }
      }
    >
      {color && !active && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: color }}
        />
      )}
      <span>{label}</span>
      {typeof count === "number" && (
        <span className="opacity-60 tabular-nums">{count}</span>
      )}
    </Link>
  );
}
