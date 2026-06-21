"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, ChevronsLeft, ChevronsRight, Star, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { openGlobalUpload } from "@/components/upload/global-upload-modal";
import { NAV_GROUPS, NAV_FOOTER, type NavLeaf } from "./nav-groups";
import { BrandWidget } from "@/components/brand/brand-widget";
import { ExplorerTree } from "./explorer-tree";
import { PresenceDots } from "@/components/presence/presence-dots";
import { FounderPresence } from "@/components/presence/founder-presence";
import type { WorkspaceDoc } from "@/db/queries/items";

const STORAGE_KEY = "agb_sidebar_collapsed_v1";
const RAIL_KEY = "agb_sidebar_rail_v1";

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavRow({ item, pathname, rail }: { item: NavLeaf; pathname: string; rail?: boolean }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={rail ? item.label : undefined}
      title={rail ? item.label : undefined}
      className={cn(
        "flex items-center rounded-md text-[13px] transition-colors",
        rail ? "h-10 justify-center px-0 py-0" : "min-h-10 gap-2 px-2.5 py-1.5",
        active
          ? "bg-surface font-medium text-text-primary"
          : "text-text-secondary hover:bg-surface hover:text-text-primary",
      )}
    >
      <Icon size={rail ? 18 : 16} className="shrink-0" />
      {!rail && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

export function Sidebar({
  projects = [],
  favorites = [],
  docs = [],
}: {
  projects?: { id: string; title: string }[];
  favorites?: { id: string; title: string }[];
  docs?: WorkspaceDoc[];
}) {
  const pathname = usePathname();
  // Per-section collapsed state, persisted per browser. Initialised empty (all
  // expanded) for a deterministic first render; hydrated from localStorage in a
  // rAF after mount (no synchronous setState-in-effect, no hydration mismatch).
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Whole-sidebar "rail" mode (icons only), persisted per browser.
  const [rail, setRail] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) setCollapsed(JSON.parse(saved));
        setRail(localStorage.getItem(RAIL_KEY) === "1");
      } catch {
        /* ignore */
      }
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  function toggleRail() {
    setRail((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(RAIL_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

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
      className={cn(
        "hidden shrink-0 border-r bg-card transition-[width] duration-150 md:flex md:flex-col",
        rail ? "w-[60px]" : "w-[224px]",
      )}
      style={{ borderColor: "var(--border-default)" }}
    >
      {rail ? (
        <div
          className="flex min-h-14 flex-col items-center justify-center gap-1.5 border-b px-2 py-2"
          style={{ borderColor: "var(--border-default)" }}
        >
          <BrandWidget rail />
          <button
            type="button"
            onClick={toggleRail}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            aria-pressed={rail}
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface hover:text-text-secondary active:scale-[0.96]"
          >
            <ChevronsRight size={18} className="shrink-0" />
          </button>
        </div>
      ) : (
        <div
          className="flex h-14 items-center justify-between gap-2 border-b px-3"
          style={{ borderColor: "var(--border-default)" }}
        >
          <BrandWidget />
          <button
            type="button"
            onClick={toggleRail}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            aria-pressed={rail}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface hover:text-text-secondary active:scale-[0.96]"
          >
            <ChevronsLeft size={16} className="shrink-0" />
          </button>
        </div>
      )}

      {rail ? (
        <nav aria-label="Primary" className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          <div
            className="mb-1.5 flex justify-center border-b pb-2"
            style={{ borderColor: "var(--border-default)" }}
          >
            <FounderPresence rail />
          </div>
          <button
            type="button"
            onClick={() => openGlobalUpload()}
            title="Upload a file"
            aria-label="Upload a file"
            className="mb-0.5 flex h-10 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface hover:text-text-primary active:scale-[0.96]"
          >
            <Upload size={18} className="shrink-0" />
          </button>
          {NAV_GROUPS.flatMap((g) => g.items).map((item) => (
            <NavRow key={item.href} item={item} pathname={pathname} rail />
          ))}
        </nav>
      ) : (
        <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          <div
            className="mb-1.5 border-b pb-2"
            style={{ borderColor: "var(--border-default)" }}
          >
            <FounderPresence />
          </div>
          <button
            type="button"
            onClick={() => openGlobalUpload()}
            className="mb-1 flex items-center gap-2 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface hover:text-text-primary active:scale-[0.99]"
          >
            <Upload size={15} className="shrink-0" />
            <span className="truncate">Upload a file</span>
          </button>

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
                  href={`/lob/${f.id}`}
                  aria-current={pathname.startsWith(`/lob/${f.id}`) ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                    pathname.startsWith(`/lob/${f.id}`)
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
              {group.tree && <ExplorerTree projects={projects} docs={docs} />}
            </Section>
          ))}
        </nav>
      )}

      {!rail && <PresenceDots />}

      <div className="border-t p-2" style={{ borderColor: "var(--border-default)" }}>
        {NAV_FOOTER.map((item) => (
          <NavRow key={item.href} item={item} pathname={pathname} rail={rail} />
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
