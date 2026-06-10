"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MultiSelectOption = {
  value: string;
  label: string;
  /** Secondary text rendered right-aligned (e.g. a contact count). */
  hint?: string;
  /** Optional swatch color rendered as a dot before the label. */
  color?: string | null;
};

/** Show the inline search box only when the list is long enough to need it. */
const SEARCH_THRESHOLD = 7;

/**
 * Searchable multi-select dropdown (Radix Popover + checkbox rows). Controlled:
 * the parent owns `selected` and persists it (e.g. into URL params). Trigger is
 * styled to sit next to the grid's 8-height Select controls.
 */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = "Any",
  className,
  triggerClassName,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
  /** Override trigger sizing (default w-44). */
  triggerClassName?: string;
}) {
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const summary = useMemo(() => {
    if (selected.length === 0) return placeholder;
    if (selected.length === 1) {
      return options.find((o) => o.value === selected[0])?.label ?? selected[0];
    }
    return `${selected.length} selected`;
  }, [selected, options, placeholder]);

  function toggle(value: string) {
    const next = new Set(selectedSet);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    // Preserve the option order so URL params stay stable/canonical.
    onChange(options.filter((o) => next.has(o.value)).map((o) => o.value));
  }

  return (
    <div className={cn("space-y-1", className)}>
      <label className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </label>
      <Popover onOpenChange={(open) => !open && setQuery("")}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex h-8 w-44 items-center justify-between gap-1 rounded-md border border-[var(--border)] bg-transparent px-3 text-xs transition-colors hover:bg-[var(--muted)]/30",
              selected.length === 0 && "text-[var(--muted-foreground)]",
              triggerClassName,
            )}
            aria-label={`Filter by ${label.toLowerCase()}`}
          >
            <span className="truncate">{summary}</span>
            <span className="flex shrink-0 items-center gap-1">
              {selected.length > 1 && (
                <span className="rounded-full bg-[var(--muted)]/70 px-1.5 text-[10px] tabular-nums">
                  {selected.length}
                </span>
              )}
              <ChevronDown className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-1">
          {options.length >= SEARCH_THRESHOLD && (
            <div className="mb-1 flex items-center gap-1.5 border-b border-[var(--border)] px-2 pb-1.5 pt-1">
              <Search className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                className="w-full bg-transparent text-xs outline-none placeholder:text-[var(--muted-foreground)]/60"
                autoFocus
              />
            </div>
          )}
          <div className="max-h-60 overflow-y-auto">
            {visible.length === 0 ? (
              <p className="px-2 py-2 text-xs text-[var(--muted-foreground)]">No matches.</p>
            ) : (
              visible.map((o) => {
                const on = selectedSet.has(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggle(o.value)}
                    aria-pressed={on}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-[var(--accent)]"
                  >
                    <span
                      className={cn(
                        "grid h-3.5 w-3.5 shrink-0 place-items-center rounded-sm border",
                        on
                          ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                          : "border-[var(--border)]",
                      )}
                    >
                      {on && <Check className="h-2.5 w-2.5" />}
                    </span>
                    {o.color && (
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: o.color }}
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate" title={o.label}>
                      {o.label}
                    </span>
                    {o.hint && (
                      <span className="shrink-0 text-[10px] tabular-nums text-[var(--muted-foreground)]">
                        {o.hint}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
          {selected.length > 0 && (
            <div className="mt-1 border-t border-[var(--border)] px-1 pt-1">
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full rounded px-2 py-1 text-left text-[11px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
              >
                Clear selection
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
