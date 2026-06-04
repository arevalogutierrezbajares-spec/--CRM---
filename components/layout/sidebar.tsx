"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS, NAV_FOOTER, type NavLeaf } from "./nav-groups";
import { ExplorerTree } from "./explorer-tree";
import { PresenceDots } from "@/components/presence/presence-dots";

const STORAGE_KEY = "agb_sidebar_collapsed_v1";

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavRow({ item, pathname }: { item: NavLeaf; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
        active
          ? "bg-surface font-medium text-text-primary"
          : "text-text-secondary hover:bg-surface hover:text-text-primary",
      )}
    >
      <Icon size={16} className="shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function Sidebar({
  projects = [],
  favorites = [],
}: {
  projects?: { id: string; title: string }[];
  favorites?: { id: string; title: string }[];
}) {
  const pathname = usePathname();
  // Per-section collapsed state, persisted per browser. Initialised empty (all
  // expanded) for a deterministic first render; hydrated from localStorage in a
  // rAF after mount (no synchronous setState-in-effect, no hydration mismatch).
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) setCollapsed(JSON.parse(saved));
      } catch {
        /* ignore */
      }
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  function persist(next: Record<string, boolean>) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function toggle(id: string, all: boolean) {
    setCollapsed((prev) => {
      let next: Record<string, boolean>;
      if (all) {
        // Alt-click: collapse/expand every section at once.
        const target = !prev[id];
        next = {};
        for (const g of NAV_GROUPS) next[g.id] = target;
        if (favorites.length) next.favorites = target;
      } else {
        next = { ...prev, [id]: !prev[id] };
      }
      persist(next);
      return next;
    });
  }

  return (
    <aside
      className="hidden w-[224px] shrink-0 border-r bg-card md:flex md:flex-col"
      style={{ borderColor: "var(--border-default)" }}
    >
      <Link
        href="/"
        className="flex h-14 items-center gap-2 border-b px-4 transition-colors hover:bg-surface/40"
        style={{ borderColor: "var(--border-default)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/crm.svg" alt="AGB CRM" width={28} height={28} className="shrink-0 dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/crm-light.svg" alt="" aria-hidden width={28} height={28} className="shrink-0 hidden dark:block" />
        <span className="text-[13px] font-medium tracking-tight text-text-primary">AGB CRM</span>
      </Link>

      <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {/* Favorites (pinned projects) */}
        {favorites.length > 0 && (
          <Section
            id="favorites"
            label="Favorites"
            collapsed={!!collapsed.favorites}
            onToggle={(all) => toggle("favorites", all)}
          >
            {favorites.map((f) => (
              <Link
                key={f.id}
                href={`/projects/${f.id}`}
                aria-current={pathname.startsWith(`/projects/${f.id}`) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                  pathname.startsWith(`/projects/${f.id}`)
                    ? "bg-surface font-medium text-text-primary"
                    : "text-text-secondary hover:bg-surface hover:text-text-primary",
                )}
              >
                <Star size={14} className="shrink-0 text-gold" fill="currentColor" />
                <span className="truncate">{f.title}</span>
              </Link>
            ))}
          </Section>
        )}

        {NAV_GROUPS.map((group) => (
          <Section
            key={group.id}
            id={group.id}
            label={group.label}
            collapsed={!!collapsed[group.id]}
            onToggle={(all) => toggle(group.id, all)}
          >
            {group.items.map((item) => (
              <NavRow key={item.href} item={item} pathname={pathname} />
            ))}
            {group.tree && <ExplorerTree projects={projects} />}
          </Section>
        ))}
      </nav>

      <PresenceDots />

      <div className="border-t p-2" style={{ borderColor: "var(--border-default)" }}>
        {NAV_FOOTER.map((item) => (
          <NavRow key={item.href} item={item} pathname={pathname} />
        ))}
      </div>
    </aside>
  );
}

function Section({
  id,
  label,
  collapsed,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  collapsed: boolean;
  onToggle: (all: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        // Alt/Option-click collapses or expands every section at once.
        onClick={(e) => onToggle(e.altKey)}
        aria-expanded={!collapsed}
        aria-controls={`nav-sec-${id}`}
        className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-tiny font-semibold uppercase tracking-wide text-text-tertiary hover:text-text-secondary"
      >
        <ChevronRight size={12} className={cn("shrink-0 transition-transform", !collapsed && "rotate-90")} />
        {label}
      </button>
      {!collapsed && (
        <div id={`nav-sec-${id}`} className="mt-0.5 flex flex-col gap-0.5">
          {children}
        </div>
      )}
    </div>
  );
}
