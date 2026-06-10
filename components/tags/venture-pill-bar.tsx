"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

type Tag = { id: string; name: string; color?: string | null };

export function VenturePillBar({ tags }: { tags: Tag[] }) {
  const sp = useSearchParams();
  const pathname = usePathname();
  // ?tag= is a comma list (multi-select); pills toggle membership.
  const activeNames = (sp.get("tag") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const active = activeNames.length > 0;

  if (tags.length === 0) return null;

  const base = "px-3 py-1 rounded-full text-xs font-medium border transition-colors";

  function hrefFor(tagName: string | null) {
    const params = new URLSearchParams(sp.toString());
    if (tagName === null) {
      params.delete("tag");
    } else {
      const next = activeNames.includes(tagName)
        ? activeNames.filter((n) => n !== tagName)
        : [...activeNames, tagName];
      if (next.length > 0) params.set("tag", next.join(","));
      else params.delete("tag");
    }
    const q = params.toString();
    return q ? `${pathname}?${q}` : pathname;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={hrefFor(null)}
        className={cn(
          base,
          !active
            ? "bg-[var(--primary)] text-[var(--primary-foreground)] border-transparent"
            : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
        )}
      >
        All
      </Link>
      {tags.map((t) => {
        const isActive = activeNames.includes(t.name);
        return (
          <Link
            key={t.id}
            href={hrefFor(t.name)}
            className={cn(
              base,
              isActive
                ? "text-[var(--primary-foreground)] border-transparent"
                : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
            )}
            style={
              isActive && t.color
                ? { backgroundColor: t.color }
                : undefined
            }
          >
            {t.name}
          </Link>
        );
      })}
    </div>
  );
}
