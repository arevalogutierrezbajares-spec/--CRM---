import type { ThemeRow } from "@/db/queries/work";

interface ThemeChipsProps {
  themes: ThemeRow[];
  size?: "xs" | "sm";
}

export function ThemeChips({ themes, size = "sm" }: ThemeChipsProps) {
  if (themes.length === 0) return null;
  const sz = size === "xs" ? "text-tiny px-1.5 py-0.5" : "text-[11px] px-2 py-0.5";
  return (
    <div className="flex flex-wrap gap-1">
      {themes.map((t) => (
        <span
          key={t.id}
          className={`inline-flex items-center gap-1 rounded-full font-medium border ${sz}`}
          style={{
            borderColor: t.color ?? "var(--border-default)",
            color: t.color ?? "var(--text-secondary)",
            background: t.color
              ? `color-mix(in oklab, ${t.color} 8%, transparent)`
              : "var(--bg-surface)",
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: t.color ?? "var(--text-tertiary)" }}
          />
          {t.name}
        </span>
      ))}
    </div>
  );
}
