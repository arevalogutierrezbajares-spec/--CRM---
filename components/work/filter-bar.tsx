"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterDimension {
  /** URL query-param key (e.g. "theme", "venture") */
  key: string;
  /** Label shown above the chip row */
  label: string;
  /** Available options */
  options: Array<{
    value: string;
    label: string;
    color?: string | null;
    count?: number;
  }>;
}

interface FilterBarProps {
  dimensions: FilterDimension[];
}

export function FilterBar({ dimensions }: FilterBarProps) {
  const pathname = usePathname();
  const sp = useSearchParams();

  function hrefWith(key: string, value: string | null): string {
    const next = new URLSearchParams(sp.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    const s = next.toString();
    return s ? `${pathname}?${s}` : pathname;
  }

  function hrefClear(): string {
    return pathname;
  }

  const activeCount = dimensions.reduce(
    (acc, d) => acc + (sp.get(d.key) ? 1 : 0),
    0,
  );

  return (
    <div className="space-y-2">
      {dimensions.map((dim) => {
        const current = sp.get(dim.key);
        return (
          <div key={dim.key} className="flex items-baseline gap-2 flex-wrap">
            <span className="text-tiny text-text-tertiary font-medium uppercase tracking-wider min-w-[80px]">
              {dim.label}
            </span>
            <div className="flex flex-wrap items-center gap-1">
              <FilterChip
                href={hrefWith(dim.key, null)}
                label="All"
                active={!current}
              />
              {dim.options.map((opt) => (
                <FilterChip
                  key={opt.value}
                  href={hrefWith(dim.key, opt.value)}
                  label={opt.label}
                  count={opt.count}
                  color={opt.color}
                  active={current === opt.value}
                />
              ))}
            </div>
          </div>
        );
      })}

      {activeCount > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <Link
            href={hrefClear()}
            className="inline-flex items-center gap-1 text-tiny text-text-secondary hover:text-text-primary"
          >
            <X size={11} /> Clear {activeCount} filter
            {activeCount === 1 ? "" : "s"}
          </Link>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  href,
  label,
  count,
  color,
  active,
}: {
  href: string;
  label: string;
  count?: number;
  color?: string | null;
  active: boolean;
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
                color: color,
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
