"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const VIEWS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

export type DashboardView = (typeof VIEWS)[number]["value"];

export function ViewToggle() {
  const sp = useSearchParams();
  const current = (sp.get("view") as DashboardView) || "daily";

  return (
    <div
      className="inline-flex items-center rounded-md border p-0.5 bg-card"
      style={{ borderColor: "var(--border-default)" }}
    >
      {VIEWS.map((v) => {
        const active = v.value === current;
        const href = v.value === "daily" ? "/" : `/?view=${v.value}`;
        return (
          <Link
            key={v.value}
            href={href}
            className={cn(
              "px-3 py-1 text-[12px] rounded transition-colors",
              active
                ? "bg-surface text-text-primary font-medium"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {v.label}
          </Link>
        );
      })}
    </div>
  );
}
