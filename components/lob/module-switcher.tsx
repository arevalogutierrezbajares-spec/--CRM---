"use client";

import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface ModuleTab {
  id: string;
  title: string;
  coverEmoji: string | null;
  coverColor: string | null;
}

interface ModuleSwitcherProps {
  parentId: string;
  modules: ModuleTab[];
}

export function ModuleSwitcher({ parentId, modules }: ModuleSwitcherProps) {
  const sp = useSearchParams();
  const pathname = usePathname();
  const current = sp.get("module"); // null = parent overview

  function hrefFor(moduleId: string | null): string {
    const next = new URLSearchParams(sp.toString());
    if (moduleId === null) next.delete("module");
    else next.set("module", moduleId);
    const q = next.toString();
    return q ? `${pathname}?${q}` : pathname;
  }

  return (
    <div
      className="flex items-center gap-1 overflow-x-auto border-b -mx-1 px-1 pb-px"
      style={{ borderColor: "var(--border-default)" }}
    >
      <Tab
        href={hrefFor(null)}
        active={!current}
        emoji="🗂"
        color={null}
        label="Overview"
      />
      {modules.map((m) => (
        <Tab
          key={m.id}
          href={hrefFor(m.id)}
          active={current === m.id}
          emoji={m.coverEmoji ?? "📁"}
          color={m.coverColor}
          label={m.title}
        />
      ))}
    </div>
  );
}

function Tab({
  href,
  active,
  emoji,
  color,
  label,
}: {
  href: string;
  active: boolean;
  emoji: string;
  color: string | null;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-[13px] border-b-2 -mb-px transition-colors",
        active
          ? "font-medium text-text-primary"
          : "border-transparent text-text-secondary hover:text-text-primary",
      )}
      style={
        active
          ? { borderBottomColor: color ?? "var(--text-primary)" }
          : { borderBottomColor: "transparent" }
      }
    >
      <span className="text-[14px]">{emoji}</span>
      <span>{label}</span>
    </Link>
  );
}
