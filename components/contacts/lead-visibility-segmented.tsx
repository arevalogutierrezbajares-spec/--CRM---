"use client";

import type { ComponentType } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ListFilter, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type LeadView = "direct" | "leads" | "all";

function parseLeadView(value: string | null): LeadView {
  if (value === "leads" || value === "all") return value;
  return "direct";
}

export function LeadVisibilitySegmented() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const current = parseLeadView(sp.get("leadView"));

  function setLeadView(nextView: LeadView) {
    const next = new URLSearchParams(sp.toString());
    if (nextView === "direct") next.delete("leadView");
    else next.set("leadView", nextView);
    const q = next.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  }

  const options: Array<{
    value: LeadView;
    label: string;
    icon: ComponentType<{ className?: string }>;
  }> = [
    { value: "direct", label: "Direct", icon: Users },
    { value: "leads", label: "LinkedIn leads", icon: Search },
    { value: "all", label: "All", icon: ListFilter },
  ];

  return (
    <div className="inline-flex rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-0.5">
      {options.map((opt) => {
        const isActive = current === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setLeadView(opt.value)}
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
