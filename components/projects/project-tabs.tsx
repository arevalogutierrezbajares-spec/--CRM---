"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, LayoutDashboard, ListTodo, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProjectTabKey = "overview" | "tasks" | "documentation";

const TABS: { key: ProjectTabKey; label: string; icon: LucideIcon }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "tasks", label: "Tasks", icon: ListTodo },
  { key: "documentation", label: "Documentation", icon: FileText },
];

const variants = {
  enter: (dir: number) => ({ x: dir >= 0 ? 36 : -36, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir >= 0 ? -36 : 36, opacity: 0 }),
};

interface ProjectTabsProps {
  initialTab?: ProjectTabKey;
  overview: React.ReactNode;
  tasks: React.ReactNode;
  documentation: React.ReactNode;
}

/**
 * Project view tab strip (Overview · Tasks · Documentation) with a direction-aware
 * slide animation between panels and touch drag-to-swipe on mobile. Panel content
 * is rendered on the server and passed in as nodes, so switching tabs is instant
 * (no re-fetch). The active tab is mirrored to `?tab=` via a shallow history
 * replace so links are shareable without a server round-trip.
 */
export function ProjectTabs({ initialTab, overview, tasks, documentation }: ProjectTabsProps) {
  const [state, setState] = useState<{ key: ProjectTabKey; dir: number }>({
    key: initialTab ?? "overview",
    dir: 0,
  });

  const panels: Record<ProjectTabKey, React.ReactNode> = { overview, tasks, documentation };
  const index = TABS.findIndex((t) => t.key === state.key);

  function go(next: ProjectTabKey) {
    const to = TABS.findIndex((t) => t.key === next);
    if (to === index) return;
    setState({ key: next, dir: to > index ? 1 : -1 });
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (next === "overview") url.searchParams.delete("tab");
      else url.searchParams.set("tab", next);
      window.history.replaceState(null, "", url.toString());
    }
  }

  function goRelative(delta: number) {
    const to = index + delta;
    if (to < 0 || to >= TABS.length) return;
    go(TABS[to].key);
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Project sections"
        className="flex items-center gap-1 overflow-x-auto border-b -mx-1 px-1"
        style={{ borderColor: "var(--border-default)" }}
      >
        {TABS.map((t) => {
          const active = t.key === state.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => go(t.key)}
              className={cn(
                "shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-[13px] border-b-2 -mb-px transition-colors",
                active
                  ? "font-medium text-text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary",
              )}
              style={{ borderBottomColor: active ? "var(--text-primary)" : "transparent" }}
            >
              <Icon size={14} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden pt-4">
        <AnimatePresence mode="wait" custom={state.dir} initial={false}>
          <motion.div
            key={state.key}
            custom={state.dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2, ease: "easeOut" }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={(_e, info) => {
              const threshold = 80;
              if (info.offset.x < -threshold) goRelative(1);
              else if (info.offset.x > threshold) goRelative(-1);
            }}
          >
            {panels[state.key]}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
