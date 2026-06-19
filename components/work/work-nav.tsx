"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/work", label: "All work" },
  { href: "/sprint", label: "Sprint" },
  { href: "/initiatives", label: "Initiatives" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/tech", label: "Tech Board" },
  { href: "/overlord", label: "Overlord" },
];

export function WorkNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Work"
      className="flex items-center gap-1 border-b"
      style={{ borderColor: "var(--border-default)" }}
    >
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "px-3 py-2 text-[13px] transition-colors border-b-2 -mb-px",
              active
                ? "font-medium text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary",
            )}
            style={
              active
                ? { borderBottomColor: "var(--text-primary)" }
                : { borderBottomColor: "transparent" }
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
