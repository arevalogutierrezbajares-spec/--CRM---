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
        href="/overlord"
        active={!current}
        label="All"
        count={totalActive}
        total={totalCount}
      />
      {sections.map((s) => (
        <Pill
          key={s.sectionKey}
          href={`/overlord?section=${s.sectionKey}`}
          active={current === s.sectionKey}
          label={s.sectionName}
          count={s.active}
          total={s.count}
        />
      ))}
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
          ? "bg-text-primary text-card font-medium"
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
