"use client";

/**
 * Roadmap timeline — Microsoft-Project-lite.
 * Initiatives in collapsible Line-of-Business swimlanes; bars drag to move and
 * resize to change duration. A *click* (no drag) selects the milestone: its
 * deliverables expand inline beneath the bar, and the plan below filters to it
 * (selection is owned by the parent board). Click again → clear.
 */

import { useCallback, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import type { PlanDocInitiative, PlanDocTask } from "@/db/queries/roadmap";
import {
  createRoadmapTask,
  toggleRoadmapTask,
  updateInitiativeFields,
  updateRoadmapTask,
} from "@/app/(app)/roadmap/actions";

export type TimelineItem = {
  id: string;
  title: string;
  subLabel: string | null;
  startDate: string | null;
  targetEndDate: string | null;
  healthColor: string;
  taskCount: number;
  taskDoneCount: number;
};

export type TimelineGroup = {
  lobId: string | null;
  lobTitle: string;
  items: TimelineItem[];
};

const DAY = 86_400_000;
const LABEL_W = 200;

function isoToMs(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00").getTime();
  return Number.isNaN(d) ? null : d;
}
const msToIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const clampPct = (p: number) => Math.max(0, Math.min(100, p));
function fillFor(health: string): string {
  return health === "red"
    ? "var(--red-mid)"
    : health === "amber"
      ? "var(--amber-mid)"
      : "var(--green-mid)";
}

type Drag = {
  id: string;
  mode: "move" | "resize-l" | "resize-r";
  trackW: number;
  startX: number;
  moved: boolean;
  origStartMs: number;
  origEndMs: number;
  startMs: number;
  endMs: number;
};

export function RoadmapTimeline({
  monthCount,
  months,
  windowStartMs,
  windowTotalMs,
  todayPct,
  groups,
  detailsById,
  selectedId,
  onSelect,
}: {
  monthCount: number;
  months: Array<{ label: string }>;
  windowStartMs: number;
  windowTotalMs: number;
  todayPct: number;
  groups: TimelineGroup[];
  detailsById: Record<string, PlanDocInitiative>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [, startTransition] = useTransition();

  const pxToMs = useCallback(
    (px: number, trackW: number) => (px / trackW) * windowTotalMs,
    [windowTotalMs],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const moved = d.moved || Math.abs(dx) > 3;
      const deltaMs = pxToMs(dx, d.trackW);
      let startMs = d.origStartMs;
      let endMs = d.origEndMs;
      if (d.mode === "move") {
        startMs = d.origStartMs + deltaMs;
        endMs = d.origEndMs + deltaMs;
      } else if (d.mode === "resize-l") {
        startMs = Math.min(d.origStartMs + deltaMs, d.origEndMs - DAY);
      } else {
        endMs = Math.max(d.origEndMs + deltaMs, d.origStartMs + DAY);
      }
      const next = { ...d, moved, startMs, endMs };
      dragRef.current = next;
      setDrag(next);
    },
    [pxToMs],
  );

  const onPointerUp = useCallback(() => {
    const d = dragRef.current;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    dragRef.current = null;
    setDrag(null);
    if (!d) return;
    if (!d.moved) {
      onSelect(d.id === selectedId ? null : d.id); // click toggles selection
      return;
    }
    const startDate = msToIso(Math.round(d.startMs / DAY) * DAY);
    const targetEndDate = msToIso(Math.round(d.endMs / DAY) * DAY);
    startTransition(() =>
      updateInitiativeFields(d.id, { startDate, targetEndDate }),
    );
  }, [onPointerMove, onSelect, selectedId]);

  const beginDrag = useCallback(
    (e: React.PointerEvent, item: TimelineItem, mode: Drag["mode"]) => {
      e.preventDefault();
      e.stopPropagation();
      const track = (e.currentTarget as HTMLElement).closest(
        "[data-track]",
      ) as HTMLElement | null;
      if (!track) return;
      const trackW = track.getBoundingClientRect().width;
      const origStartMs = isoToMs(item.startDate) ?? windowStartMs;
      const origEndMs = isoToMs(item.targetEndDate) ?? origStartMs + 14 * DAY;
      const d: Drag = {
        id: item.id,
        mode,
        trackW,
        startX: e.clientX,
        moved: false,
        origStartMs,
        origEndMs,
        startMs: origStartMs,
        endMs: origEndMs,
      };
      dragRef.current = d;
      setDrag(d);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [onPointerMove, onPointerUp, windowStartMs],
  );

  function barGeom(item: TimelineItem): { left: number; width: number } {
    const live = drag && drag.id === item.id ? drag : null;
    const sMs = live ? live.startMs : isoToMs(item.startDate);
    const eMs = live
      ? live.endMs
      : isoToMs(item.targetEndDate) ?? (sMs ?? windowStartMs) + 14 * DAY;
    if (sMs == null) return { left: 0, width: 0 };
    const left = clampPct(((sMs - windowStartMs) / windowTotalMs) * 100);
    const right = clampPct(((eMs - windowStartMs) / windowTotalMs) * 100);
    return { left, width: Math.max(1.5, right - left) };
  }

  return (
    <div
      className="rounded-lg border bg-card p-3 overflow-x-auto"
      style={{ borderColor: "var(--border-default)" }}
    >
      <div
        className="min-w-[700px] relative"
        style={{ userSelect: drag ? "none" : "auto" }}
      >
        <div
          className="grid border-b pb-1.5 mb-2"
          style={{
            gridTemplateColumns: `${LABEL_W}px repeat(${monthCount}, 1fr)`,
            borderColor: "var(--border-default)",
          }}
        >
          <div className="text-tiny text-text-tertiary font-medium uppercase tracking-wider">
            Line of business
          </div>
          {months.map((m, i) => (
            <div
              key={`${m.label}-${i}`}
              className="text-tiny text-text-secondary font-medium text-center"
            >
              {m.label}
            </div>
          ))}
        </div>

        {todayPct > 0 && (
          <div
            className="absolute top-8 bottom-0 border-l-2 border-dashed pointer-events-none z-10"
            style={{
              left: `calc(${LABEL_W}px + ${todayPct}% * (100% - ${LABEL_W}px) / 100%)`,
              borderColor: "var(--blue-mid)",
            }}
          />
        )}

        {groups.length === 0 ? (
          <p className="text-[12px] text-text-secondary py-4 text-center">
            No initiatives with start dates in this window. Set dates in the plan
            below and they appear here.
          </p>
        ) : (
          groups.map((g) => {
            const key = g.lobId ?? "none";
            const isCollapsed = collapsed[key];
            const done = g.items.reduce((n, i) => n + i.taskDoneCount, 0);
            const total = g.items.reduce((n, i) => n + i.taskCount, 0);
            const dimGroup = selectedId != null && !g.items.some((i) => i.id === selectedId);
            return (
              <div key={key} style={{ opacity: dimGroup ? 0.5 : 1, transition: "opacity .15s" }}>
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [key]: !c[key] }))}
                  className="flex w-full items-center gap-1.5 py-1.5 mt-1 text-left"
                >
                  <span className="text-[12px] font-semibold uppercase tracking-wider text-text-secondary">
                    {g.lobTitle}
                  </span>
                  <span className="text-tiny text-text-tertiary">
                    · {g.items.length}{" "}
                    {g.items.length === 1 ? "initiative" : "initiatives"}
                    {total > 0 ? ` · ${done}/${total}` : ""}
                  </span>
                </button>

                {!isCollapsed &&
                  g.items.map((item) => {
                    const { left, width } = barGeom(item);
                    const fill = fillFor(item.healthColor);
                    const isDragging = drag?.id === item.id;
                    const isSel = selectedId === item.id;
                    const dimRow = selectedId != null && !isSel;
                    return (
                      <div key={item.id} data-init={item.id}>
                        <div
                          className="grid items-center py-1 rounded"
                          style={{
                            gridTemplateColumns: `${LABEL_W}px 1fr`,
                            background: isSel ? "var(--surface)" : "transparent",
                            opacity: dimRow ? 0.55 : 1,
                            transition: "opacity .15s",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => onSelect(isSel ? null : item.id)}
                            className="min-w-0 pr-2 pl-3 text-left"
                          >
                            <div
                              className={`text-[12.5px] truncate ${isSel ? "font-semibold text-text-primary" : "font-medium text-text-primary"}`}
                            >
                              {item.title}
                            </div>
                            {item.subLabel && (
                              <div className="text-tiny text-text-tertiary truncate">
                                {item.subLabel}
                              </div>
                            )}
                          </button>
                          <div data-track className="relative h-7 bg-surface rounded">
                            <div
                              onPointerDown={(e) => beginDrag(e, item, "move")}
                              className="group absolute top-1 bottom-1 rounded flex items-center px-2 text-tiny font-medium text-white cursor-grab active:cursor-grabbing"
                              style={{
                                left: `${left}%`,
                                width: `${width}%`,
                                background: `color-mix(in oklab, ${fill} ${isSel || isDragging ? 95 : 72}%, transparent)`,
                                boxShadow: isSel
                                  ? "0 0 0 2px var(--blue-mid)"
                                  : isDragging
                                    ? "0 2px 10px rgba(0,0,0,.25)"
                                    : "none",
                              }}
                              title={`${item.startDate ?? "?"} → ${item.targetEndDate ?? "open"} · click to open · drag to reschedule`}
                            >
                              <span
                                onPointerDown={(e) => beginDrag(e, item, "resize-l")}
                                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize rounded-l opacity-0 group-hover:opacity-100"
                                style={{ background: "rgba(255,255,255,.5)" }}
                              />
                              <span className="truncate select-none">
                                {item.taskCount > 0
                                  ? `${item.taskDoneCount}/${item.taskCount}`
                                  : "no tasks"}
                              </span>
                              <span
                                onPointerDown={(e) => beginDrag(e, item, "resize-r")}
                                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize rounded-r opacity-0 group-hover:opacity-100"
                                style={{ background: "rgba(255,255,255,.5)" }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Inline deliverables, revealed under the selected milestone */}
                        <AnimatePresence initial={false}>
                          {isSel && (
                            <motion.div
                              key="deliverables"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.18, ease: "easeOut" }}
                              style={{ overflow: "hidden" }}
                            >
                              <div
                                className="grid"
                                style={{ gridTemplateColumns: `${LABEL_W}px 1fr` }}
                              >
                                <div />
                                <div
                                  className="rounded-md border my-1 p-2.5"
                                  style={{
                                    borderColor: "var(--border-default)",
                                    background:
                                      "color-mix(in oklab, var(--surface) 60%, transparent)",
                                  }}
                                >
                                  <div className="text-tiny font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                                    Deliverables
                                  </div>
                                  <InlineDeliverables
                                    initiativeId={item.id}
                                    tasks={detailsById[item.id]?.tasks ?? []}
                                  />
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ─── Inline deliverables editor ──────────────────────────────────────── */

function InlineDeliverables({
  initiativeId,
  tasks,
  depth = 0,
}: {
  initiativeId: string;
  tasks: PlanDocTask[];
  depth?: number;
}) {
  return (
    <ul className={depth === 0 ? "space-y-0.5" : "space-y-0.5 ml-5"}>
      {tasks.map((t) => (
        <InlineTaskRow key={t.id} task={t} initiativeId={initiativeId} depth={depth} />
      ))}
      {depth === 0 && (
        <li>
          <InlineAddTask initiativeId={initiativeId} />
        </li>
      )}
    </ul>
  );
}

function InlineTaskRow({
  task,
  initiativeId,
  depth,
}: {
  task: PlanDocTask;
  initiativeId: string;
  depth: number;
}) {
  const [, startTransition] = useTransition();
  const [checked, setChecked] = useState(task.done);
  const [title, setTitle] = useState(task.title);
  return (
    <li>
      <div className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-surface">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => {
            setChecked(e.target.checked);
            startTransition(() => toggleRoadmapTask(task.id, e.target.checked));
          }}
          className="shrink-0"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            const v = title.trim();
            if (v && v !== task.title)
              startTransition(() => updateRoadmapTask(task.id, { title: v }));
          }}
          className={`flex-1 min-w-0 bg-transparent text-[13px] outline-none ${checked ? "line-through text-text-tertiary" : ""}`}
        />
        <input
          type="date"
          defaultValue={task.dueDate ?? ""}
          onChange={(e) =>
            startTransition(() =>
              updateRoadmapTask(task.id, { dueDate: e.target.value || null }),
            )
          }
          className="rounded border bg-transparent px-1 py-0 text-[11.5px] text-text-tertiary opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          style={{ borderColor: "var(--border-default)" }}
          title="Due date"
        />
      </div>
      {task.children.length > 0 && (
        <InlineDeliverables
          initiativeId={initiativeId}
          tasks={task.children}
          depth={depth + 1}
        />
      )}
    </li>
  );
}

function InlineAddTask({ initiativeId }: { initiativeId: string }) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const submit = () => {
    const t = value.trim();
    if (!t) return;
    setValue("");
    startTransition(() =>
      createRoadmapTask({ initiativeId, title: t }).then(() => undefined),
    );
  };
  return (
    <div className="flex items-center gap-2 px-1 py-0.5">
      <Plus size={13} className="text-text-tertiary shrink-0" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        onBlur={submit}
        disabled={pending}
        placeholder="Add deliverable…"
        className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-text-tertiary"
      />
    </div>
  );
}
