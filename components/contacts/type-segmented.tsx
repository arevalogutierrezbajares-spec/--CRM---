"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Building2, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseFilter, buildHref } from "@/lib/grid-state";

type TypeValue = "person" | "org" | null;

export function TypeSegmented() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const filters = parseFilter(sp.get("filter"));
  const current = (filters.type as TypeValue) ?? null;

  function setType(next: TypeValue) {
    const nextFilters = { ...filters };
    if (next === null) delete nextFilters.type;
    else nextFilters.type = next;
    router.push(
      buildHref(pathname, new URLSearchParams(sp.toString()), {
        filters: nextFilters,
      }),
    );
  }

  const options: Array<{
    value: TypeValue;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { value: null, label: "All", icon: Users },
    { value: "person", label: "People", icon: User },
    { value: "org", label: "Organizations", icon: Building2 },
  ];

  return (
    <div className="inline-flex rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-0.5">
      {options.map((opt) => {
        const isActive = current === opt.value;
        return (
          <button
            key={opt.label}
            type="button"
            onClick={() => setType(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors",
              isActive
                ? "bg-[var(--background)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
            )}
            aria-pressed={isActive}
          >
            <opt.icon className="h-3.5 w-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
