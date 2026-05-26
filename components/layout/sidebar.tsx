"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 border-r border-[var(--border)] bg-[var(--card)] md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-[var(--border)] px-5">
        <div
          aria-hidden
          className="grid h-7 w-7 place-items-center rounded-md bg-[var(--primary)] text-xs font-semibold text-[var(--primary-foreground)]"
        >
          AGB
        </div>
        <span className="text-sm font-semibold tracking-tight">AGB CRM</span>
      </div>
      <nav aria-label="Primary" className="flex flex-1 flex-col gap-0.5 p-3">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-[var(--accent)] font-medium text-[var(--accent-foreground)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]/60 hover:text-[var(--foreground)]",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--muted-foreground)]">
        Phase 0 · v0.1.0
      </div>
    </aside>
  );
}
