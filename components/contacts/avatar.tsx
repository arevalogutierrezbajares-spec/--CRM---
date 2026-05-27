import { Building2 } from "lucide-react";

const PALETTE = [
  ["#fee2e2", "#b91c1c"],
  ["#ffedd5", "#c2410c"],
  ["#fef3c7", "#a16207"],
  ["#dcfce7", "#15803d"],
  ["#cffafe", "#0e7490"],
  ["#dbeafe", "#1d4ed8"],
  ["#ede9fe", "#6d28d9"],
  ["#fce7f3", "#be185d"],
] as const;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function ContactAvatar({
  name,
  type,
  size = 28,
}: {
  name: string;
  type: "person" | "org";
  size?: number;
}) {
  const style = { width: size, height: size } as const;
  if (type === "org") {
    return (
      <span
        className="inline-flex items-center justify-center rounded-md border border-[var(--border)] bg-[var(--muted)]/40 text-[var(--muted-foreground)]"
        style={style}
        aria-hidden
      >
        <Building2 className="h-3.5 w-3.5" />
      </span>
    );
  }
  const [bg, fg] = PALETTE[hash(name) % PALETTE.length];
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-[10px] font-semibold leading-none"
      style={{ ...style, backgroundColor: bg, color: fg }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
