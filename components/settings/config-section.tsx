"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A collapsible configuration row for Settings → Configurations. Renders a
 * clickable header (icon · title · description · chevron) that expands to show
 * its body. Keeps the Settings page short by default and lets each integration
 * (Call Capture, MCP, …) own a self-contained setup guide.
 */
export function ConfigSection({
  title,
  description,
  icon,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  /** Rendered icon element (e.g. `<Headphones className="h-5 w-5" />`). A
   *  rendered element is serializable across the server→client boundary; an
   *  icon *component* (function) is not, so callers pass an element. */
  icon?: ReactNode;
  /** Optional short status pill on the right of the header (e.g. "Connected"). */
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-5 text-left transition-colors hover:bg-[var(--muted)]/30"
      >
        {icon && (
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md bg-[var(--muted)]/50 text-[var(--muted-foreground)]">
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold tracking-tight">{title}</span>
          {description && (
            <span className="mt-0.5 block text-sm text-[var(--muted-foreground)]">
              {description}
            </span>
          )}
        </span>
        {badge}
        <ChevronDown
          className={cn(
            "h-5 w-5 flex-none text-[var(--muted-foreground)] transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="border-t border-[var(--border)] p-5">{children}</div>
      )}
    </Card>
  );
}
