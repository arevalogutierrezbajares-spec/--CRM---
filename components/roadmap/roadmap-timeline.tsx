"use client";

/**
 * Roadmap timeline — Microsoft-Project-lite.
 * Initiatives in collapsible Line-of-Business swimlanes. Bars drag to move and
 * resize to change duration (direct-DOM drag → zero per-frame React renders).
 * Click a bar → it focuses: deliverables expand inline (animated) with an
 * editable owner+dates meta row, and the plan below filters to it. Dated
 * deliverables show animated star markers on the timeline at their deadline.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { CornerDownRight, Plus, Star, X, Zap } from "lucide-react";
import type {
  InitiativeDependency,
  PlanDocInitiative,
  PlanDocTask,
} from "@/db/queries/roadmap";
import {
  addInitiativeDependency,
  createRoadmapTask,
  deleteRoadmapTask,
  removeInitiativeDependency,
  reparentRoadmapTask,
  toggleRoadmapTask,
  updateInitiativeFields,
  updateRoadmapTask,
} from "@/app/(app)/roadmap/actions";
import { DateField } from "./date-field";
import { parseDateTokens } from "@/lib/roadmap-dates";

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
type Member = { id: string; displayName: string };
type Lob = { id: string; title: string };

const DAY = 86_400_000;
const LABEL_W = 340;
const TODAY = new Date().toISOString().slice(0, 10);

const isoToMs = (iso: string | null): number | null => {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00").getTime();
  return Number.isNaN(d) ? null : d;
};
const msToIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const clampPct = (p: number) => Math.max(0, Math.min(100, p));
const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "2-digit",
      })
    : null;
const fillFor = (h: string) =>
  h === "red" ? "var(--red-mid)" : h === "amber" ? "var(--amber-mid)" : "var(--green-mid)";

/** Smooth S-curve between two points (pronounced horizontal control handles). */
function arcPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(22, Math.min(80, Math.abs(x2 - x1) * 0.5));
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** Flatten a deliverable tree to the ones with a due date (the "key dates"). */
function datedDeliverables(tasks: PlanDocTask[]): Array<{ title: string; due: string }> {
  const out: Array<{ title: string; due: string }> = [];
  const walk = (ts: PlanDocTask[]) => {
    for (const t of ts) {
      if (t.dueDate) out.push({ title: t.title, due: t.dueDate });
      if (t.children.length) walk(t.children);
    }
  };
  walk(tasks);
  return out;
}

type DragRef = {
  id: string;
  mode: "move" | "resize-l" | "resize-r";
  el: HTMLElement;
  trackW: number;
  startX: number;
  moved: boolean;
  origStartMs: number;
  origEndMs: number;
  curStartMs: number;
  curEndMs: number;
};

export function RoadmapTimeline({
  monthCount,
  months,
  windowStartMs,
  windowTotalMs,
  todayPct,
  groups,
  detailsById,
  members,
  lobs,
  deps,
  criticalIds,
  initiativeList,
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
  members: Member[];
  lobs: Lob[];
  deps: InitiativeDependency[];
  criticalIds: Set<string>;
  initiativeList: Array<{ id: string; title: string }>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, { s: number; e: number }>>({});
  const dragRef = useRef<DragRef | null>(null);
  const [, startTransition] = useTransition();

  // ── Dependency arrows + drag-to-link ──
  const containerRef = useRef<HTMLDivElement | null>(null);
  const barEls = useRef(new Map<string, HTMLElement>());
  const pathEls = useRef(new Map<string, SVGPathElement>());
  const [arrows, setArrows] = useState<
    Array<{ key: string; x1: number; y1: number; x2: number; y2: number; violated: boolean }>
  >([]);
  const [sizeTick, setSizeTick] = useState(0);
  const [linking, setLinking] = useState<{ fromId: string } | null>(null);
  const [linkCursor, setLinkCursor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSizeTick((t) => t + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Measure bar edges after layout and build connector coordinates.
  // While a milestone is focused (deliverables view) we hide all connectors
  // so the expanded panel stays clean.
  useLayoutEffect(() => {
    if (selectedId) {
      setArrows([]);
      return;
    }
    const c = containerRef.current;
    if (!c) return;
    const cr = c.getBoundingClientRect();
    const out: typeof arrows = [];
    for (const d of deps) {
      const fe = barEls.current.get(d.fromInitiativeId);
      const te = barEls.current.get(d.toInitiativeId);
      if (!fe || !te) continue; // a collapsed/off-window bar — skip its arrow
      const fr = fe.getBoundingClientRect();
      const tr = te.getBoundingClientRect();
      const fd = detailsById[d.fromInitiativeId];
      const td = detailsById[d.toInitiativeId];
      const violated = !!(
        fd?.targetEndDate &&
        td?.startDate &&
        fd.targetEndDate > td.startDate
      );
      out.push({
        key: d.id,
        x1: fr.right - cr.left,
        y1: fr.top - cr.top + fr.height / 2,
        x2: tr.left - cr.left,
        y2: tr.top - cr.top + tr.height / 2,
        violated,
      });
    }
    setArrows(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps, groups, collapsed, selectedId, optimistic, sizeTick, detailsById]);

  const beginLink = useCallback(
    (e: React.PointerEvent, fromId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setLinking({ fromId });
      const move = (ev: PointerEvent) => {
        const c = containerRef.current;
        if (!c) return;
        const cr = c.getBoundingClientRect();
        setLinkCursor({ x: ev.clientX - cr.left, y: ev.clientY - cr.top });
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        const target = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest(
          "[data-init]",
        );
        const toId = target?.getAttribute("data-init") ?? null;
        setLinking(null);
        setLinkCursor(null);
        if (toId && toId !== fromId) {
          startTransition(async () => {
            const r = await addInitiativeDependency(fromId, toId);
            if (!r.ok && r.error) toast.error(r.error);
          });
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [],
  );

  const pctOf = useCallback(
    (ms: number) => clampPct(((ms - windowStartMs) / windowTotalMs) * 100),
    [windowStartMs, windowTotalMs],
  );

  // ── Direct-DOM drag: mutate the bar's style on move, commit on up. No
  //    per-frame setState, so dragging stays at 60fps regardless of row count.
  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) > 3) d.moved = true;
    const deltaMs = (dx / d.trackW) * windowTotalMs;
    let s = d.origStartMs;
    let en = d.origEndMs;
    if (d.mode === "move") {
      s = d.origStartMs + deltaMs;
      en = d.origEndMs + deltaMs;
    } else if (d.mode === "resize-l") {
      s = Math.min(d.origStartMs + deltaMs, d.origEndMs - DAY);
    } else {
      en = Math.max(d.origEndMs + deltaMs, d.origStartMs + DAY);
    }
    d.curStartMs = s;
    d.curEndMs = en;
    const left = clampPct(((s - windowStartMs) / windowTotalMs) * 100);
    const right = clampPct(((en - windowStartMs) / windowTotalMs) * 100);
    d.el.style.left = `${left}%`;
    d.el.style.width = `${Math.max(1.5, right - left)}%`;

    // Live-follow: redraw any dependency arrows touching the dragged bar by
    // mutating their path 'd' directly (no React render → stays smooth).
    const c = containerRef.current;
    if (c && pathEls.current.size) {
      const cr = c.getBoundingClientRect();
      for (const dep of deps) {
        if (dep.fromInitiativeId !== d.id && dep.toInitiativeId !== d.id) continue;
        const pe = pathEls.current.get(dep.id);
        const fe = barEls.current.get(dep.fromInitiativeId);
        const te = barEls.current.get(dep.toInitiativeId);
        if (!pe || !fe || !te) continue;
        const fr = fe.getBoundingClientRect();
        const tr = te.getBoundingClientRect();
        pe.setAttribute(
          "d",
          arcPath(fr.right - cr.left, fr.top - cr.top + fr.height / 2, tr.left - cr.left, tr.top - cr.top + tr.height / 2),
        );
      }
    }
  }, [windowStartMs, windowTotalMs, deps]);

  const onPointerUp = useCallback(() => {
    const d = dragRef.current;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    dragRef.current = null;
    setDraggingId(null);
    if (!d) return;
    if (!d.moved) {
      onSelect(d.id === selectedId ? null : d.id);
      return;
    }
    const s = Math.round(d.curStartMs / DAY) * DAY;
    const en = Math.round(d.curEndMs / DAY) * DAY;
    setOptimistic((o) => ({ ...o, [d.id]: { s, e: en } }));
    startTransition(() =>
      updateInitiativeFields(d.id, { startDate: msToIso(s), targetEndDate: msToIso(en) }),
    );
  }, [onPointerMove, onSelect, selectedId]);

  const beginDrag = useCallback(
    (e: React.PointerEvent, item: TimelineItem, mode: DragRef["mode"]) => {
      e.preventDefault();
      e.stopPropagation();
      const barEl = (e.currentTarget as HTMLElement).closest("[data-bar]") as HTMLElement | null;
      const track = (e.currentTarget as HTMLElement).closest("[data-track]") as HTMLElement | null;
      if (!barEl || !track) return;
      const o = optimistic[item.id];
      const origStartMs = o?.s ?? isoToMs(item.startDate) ?? windowStartMs;
      const origEndMs = o?.e ?? isoToMs(item.targetEndDate) ?? origStartMs + 14 * DAY;
      dragRef.current = {
        id: item.id,
        mode,
        el: barEl,
        trackW: track.getBoundingClientRect().width,
        startX: e.clientX,
        moved: false,
        origStartMs,
        origEndMs,
        curStartMs: origStartMs,
        curEndMs: origEndMs,
      };
      setDraggingId(item.id);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [onPointerMove, onPointerUp, optimistic, windowStartMs],
  );

  function geom(item: TimelineItem) {
    const o = optimistic[item.id];
    const sMs = o?.s ?? isoToMs(item.startDate);
    const eMs = o?.e ?? isoToMs(item.targetEndDate) ?? (sMs ?? windowStartMs) + 14 * DAY;
    if (sMs == null) return { left: 0, width: 0 };
    const left = pctOf(sMs);
    return { left, width: Math.max(1.5, pctOf(eMs) - left) };
  }

  return (
    <div
      className="rounded-lg border bg-card p-3 overflow-x-auto"
      style={{ borderColor: "var(--border-default)" }}
    >
      <div
        ref={containerRef}
        className="min-w-[700px] relative"
        style={{ userSelect: draggingId || linking ? "none" : "auto" }}
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
            <div key={`${m.label}-${i}`} className="text-tiny text-text-secondary font-medium text-center">
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
            No initiatives with start dates in this window. Set dates in the plan below.
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
                    · {g.items.length} {g.items.length === 1 ? "initiative" : "initiatives"}
                    {total > 0 ? ` · ${done}/${total}` : ""}
                  </span>
                </button>

                {!isCollapsed &&
                  g.items.map((item) => {
                    const { left, width } = geom(item);
                    const fill = fillFor(item.healthColor);
                    const isSel = selectedId === item.id;
                    const dimRow = selectedId != null && !isSel;
                    const detail = detailsById[item.id];
                    const owner = detail?.ownerUserId
                      ? members.find((m) => m.id === detail.ownerUserId)
                      : null;
                    const stars = detail ? datedDeliverables(detail.tasks) : [];
                    // Split "T-M2 · PMS — review…" into a code chip + full title.
                    const codeMatch = item.title.match(/^(.+?)\s+·\s+(.+)$/);
                    const code = codeMatch ? codeMatch[1] : null;
                    const label = codeMatch ? codeMatch[2] : item.title;
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
                            className="min-w-0 pr-2 pl-3 text-left flex items-center gap-2"
                          >
                            {code && (
                              <span
                                className="shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide tabular-nums transition-transform"
                                style={{
                                  background: `color-mix(in oklab, ${fill} 18%, transparent)`,
                                  color: fill,
                                  transform: isSel ? "scale(1.06)" : "none",
                                }}
                              >
                                {code}
                              </span>
                            )}
                            <span
                              className={`flex-1 whitespace-nowrap text-[12.5px] text-text-primary ${isSel ? "font-semibold" : "font-medium"}`}
                            >
                              {label}
                            </span>
                            {criticalIds.has(item.id) && (
                              <span className="shrink-0" title="On the critical path">
                                <Zap size={13} fill="var(--amber-mid)" style={{ color: "var(--amber-mid)" }} />
                              </span>
                            )}
                            {owner && (
                              <span
                                className="shrink-0 grid place-items-center rounded-full text-[9px] font-bold text-white"
                                style={{ width: 18, height: 18, background: "var(--blue-mid)" }}
                                title={owner.displayName}
                              >
                                {initials(owner.displayName)}
                              </span>
                            )}
                          </button>

                          <div data-track className="relative h-7 bg-surface rounded">
                            <div
                              data-bar
                              ref={(el) => {
                                if (el) barEls.current.set(item.id, el);
                                else barEls.current.delete(item.id);
                              }}
                              onPointerDown={(e) => beginDrag(e, item, "move")}
                              className="group absolute top-1 bottom-1 rounded flex items-center px-2 text-tiny font-medium text-white cursor-grab active:cursor-grabbing z-[1]"
                              style={{
                                left: `${left}%`,
                                width: `${width}%`,
                                background: `color-mix(in oklab, ${fill} ${isSel || draggingId === item.id ? 95 : 72}%, transparent)`,
                                boxShadow: isSel ? "0 0 0 2px var(--blue-mid)" : "none",
                                willChange: "left,width",
                              }}
                              title={`${item.startDate ?? "?"} → ${item.targetEndDate ?? "open"} · click to open · drag to reschedule`}
                            >
                              <span
                                onPointerDown={(e) => beginDrag(e, item, "resize-l")}
                                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize rounded-l opacity-0 group-hover:opacity-100"
                                style={{ background: "rgba(255,255,255,.5)" }}
                              />
                              <span className="truncate select-none">
                                {item.taskCount > 0 ? `${item.taskDoneCount}/${item.taskCount}` : "no tasks"}
                              </span>
                              <span
                                onPointerDown={(e) => beginDrag(e, item, "resize-r")}
                                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize rounded-r opacity-0 group-hover:opacity-100"
                                style={{ background: "rgba(255,255,255,.5)" }}
                              />
                              {/* drag-to-link handle */}
                              <span
                                onPointerDown={(e) => beginLink(e, item.id)}
                                className="absolute -right-2 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full opacity-0 group-hover:opacity-100 cursor-crosshair z-[4]"
                                style={{ background: "var(--blue-mid)", border: "2px solid white" }}
                                title="Drag to another bar to link a dependency"
                              />
                            </div>

                            {/* Animated deadline stars (a dated deliverable = a key date) */}
                            {stars.map((st, idx) => {
                              const ms = isoToMs(st.due);
                              if (ms == null) return null;
                              const overdue = st.due < TODAY;
                              return (
                                <DeadlineStar
                                  key={idx}
                                  leftPct={pctOf(ms)}
                                  overdue={overdue}
                                  title={`${st.title} · due ${fmtDate(st.due)}`}
                                />
                              );
                            })}
                          </div>
                        </div>

                        <AnimatePresence initial={false}>
                          {isSel && detail && (
                            <motion.div
                              key="deliverables"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.18, ease: "easeOut" }}
                              onAnimationComplete={() => setSizeTick((t) => t + 1)}
                              style={{ overflow: "hidden" }}
                            >
                              <div
                                className="rounded-md border my-1 p-3 space-y-3"
                                style={{
                                  borderColor: "var(--border-default)",
                                  background: "color-mix(in oklab, var(--surface) 60%, transparent)",
                                }}
                              >
                                <FocusMeta init={detail} members={members} lobs={lobs} />
                                <DependsOn
                                  initId={item.id}
                                  deps={deps}
                                  initiativeList={initiativeList}
                                />
                                <div>
                                  <div className="text-tiny font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                                    Deliverables
                                  </div>
                                  <DeliverablesEditor initiativeId={item.id} tasks={detail.tasks} />
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

        {/* Dependency connectors — routed BEHIND the bars (zIndex 0) so they
            tuck out of the way; curved. Hidden while a milestone is focused. */}
        {!selectedId && arrows.length > 0 && (
          <svg
            className="absolute inset-0 pointer-events-none"
            style={{ width: "100%", height: "100%", zIndex: 0 }}
          >
            <defs>
              <marker id="rm-arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
                <path d="M0,0 L7,3.5 L0,7 Z" fill="rgba(120,120,120,.8)" />
              </marker>
              <marker id="rm-arrow-red" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
                <path d="M0,0 L7,3.5 L0,7 Z" fill="var(--red-mid)" />
              </marker>
            </defs>
            {arrows.map((a) => (
              <path
                key={a.key}
                ref={(el) => {
                  if (el) pathEls.current.set(a.key, el);
                  else pathEls.current.delete(a.key);
                }}
                d={arcPath(a.x1, a.y1, a.x2, a.y2)}
                fill="none"
                stroke={a.violated ? "var(--red-mid)" : "rgba(120,120,120,.5)"}
                strokeWidth={a.violated ? 2 : 1.6}
                strokeLinecap="round"
                strokeDasharray={a.violated ? "5 3" : undefined}
                markerEnd={`url(#${a.violated ? "rm-arrow-red" : "rm-arrow"})`}
              />
            ))}
          </svg>
        )}

        {/* Live drag-to-link rubber-band — on top of everything. */}
        {!selectedId && linking && linkCursor && (
          <svg
            className="absolute inset-0 pointer-events-none"
            style={{ width: "100%", height: "100%", zIndex: 6 }}
          >
            <defs>
              <marker id="rm-arrow-blue" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
                <path d="M0,0 L7,3.5 L0,7 Z" fill="var(--blue-mid)" />
              </marker>
            </defs>
            {(() => {
              const fe = barEls.current.get(linking.fromId);
              const c = containerRef.current;
              if (!fe || !c) return null;
              const cr = c.getBoundingClientRect();
              const fr = fe.getBoundingClientRect();
              const x1 = fr.right - cr.left;
              const y1 = fr.top - cr.top + fr.height / 2;
              return (
                <path
                  d={arcPath(x1, y1, linkCursor.x, linkCursor.y)}
                  fill="none"
                  stroke="var(--blue-mid)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeDasharray="5 4"
                  markerEnd="url(#rm-arrow-blue)"
                />
              );
            })()}
          </svg>
        )}
      </div>
    </div>
  );
}

/* ─── Animated deadline star ──────────────────────────────────────────── */

function DeadlineStar({ leftPct, overdue, title }: { leftPct: number; overdue: boolean; title: string }) {
  const color = overdue ? "var(--red-mid)" : "var(--amber-mid)";
  return (
    <span
      className="absolute top-1/2 z-[2] pointer-events-auto"
      style={{ left: `${leftPct}%`, transform: "translate(-50%,-50%)" }}
      title={title}
    >
      <motion.span
        className="absolute inset-0 rounded-full"
        style={{ background: color, opacity: 0.4 }}
        animate={{ scale: [1, 2.1, 1], opacity: [0.45, 0, 0.45] }}
        transition={{ duration: overdue ? 1.1 : 1.9, repeat: Infinity, ease: "easeOut" }}
      />
      <motion.span
        className="relative grid place-items-center"
        animate={{ scale: [1, 1.18, 1] }}
        transition={{ duration: overdue ? 1.1 : 1.9, repeat: Infinity, ease: "easeInOut" }}
      >
        <Star size={13} fill={color} stroke="white" strokeWidth={1.2} />
      </motion.span>
    </span>
  );
}

/* ─── Focus-panel editable meta row (owner next to dates) ─────────────── */

function FocusMeta({
  init,
  members,
  lobs,
}: {
  init: PlanDocInitiative;
  members: Member[];
  lobs: Lob[];
}) {
  const [, startTransition] = useTransition();
  const save = (p: Parameters<typeof updateInitiativeFields>[1]) =>
    startTransition(() => updateInitiativeFields(init.id, p));
  const sel = "rounded border bg-card px-1.5 py-1 text-[12px]";
  const sty = { borderColor: "var(--border-default)" };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-tiny text-text-secondary">
      <label className="flex items-center gap-1.5">
        Owner
        <select
          defaultValue={init.ownerUserId ?? ""}
          onChange={(e) => save({ ownerUserId: e.target.value || null })}
          className={sel}
          style={sty}
        >
          <option value="">—</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
      </label>
      <span className="flex items-center gap-1.5">
        Dates
        <DateField value={init.startDate} onChange={(v) => save({ startDate: v })} />
        <span className="text-text-tertiary">→</span>
        <DateField value={init.targetEndDate} onChange={(v) => save({ targetEndDate: v })} />
      </span>
      <label className="flex items-center gap-1.5">
        Health
        <select
          defaultValue={init.healthColor}
          onChange={(e) => save({ healthColor: e.target.value as never })}
          className={sel}
          style={sty}
        >
          {["green", "amber", "red"].map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5">
        LoB
        <select
          defaultValue={init.lobId ?? ""}
          onChange={(e) => save({ lobId: e.target.value || null })}
          className={sel}
          style={sty}
        >
          <option value="">Cross-venture</option>
          {lobs.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/* ─── Dependency linker (focus panel) ────────────────────────────────── */

function DependsOn({
  initId,
  deps,
  initiativeList,
}: {
  initId: string;
  deps: InitiativeDependency[];
  initiativeList: Array<{ id: string; title: string }>;
}) {
  const [, startTransition] = useTransition();
  const titleOf = (id: string) => initiativeList.find((i) => i.id === id)?.title ?? "—";
  const preds = deps.filter((d) => d.toInitiativeId === initId);
  const predIds = new Set(preds.map((p) => p.fromInitiativeId));
  const options = initiativeList.filter((i) => i.id !== initId && !predIds.has(i.id));
  return (
    <div>
      <div className="text-tiny font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
        Depends on
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {preds.map((p) => (
          <span
            key={p.id}
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] text-text-primary"
            style={{ borderColor: "var(--border-default)" }}
          >
            {titleOf(p.fromInitiativeId)}
            <button
              type="button"
              onClick={() => startTransition(() => removeInitiativeDependency(p.id))}
              className="text-text-tertiary hover:text-text-primary"
              aria-label="Remove dependency"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {preds.length === 0 && <span className="text-[12px] text-text-tertiary">none yet</span>}
        <select
          value=""
          onChange={(e) => {
            const from = e.target.value;
            if (!from) return;
            startTransition(async () => {
              const r = await addInitiativeDependency(from, initId);
              if (!r.ok && r.error) toast.error(r.error);
            });
          }}
          className="rounded border bg-card px-1.5 py-1 text-[12px]"
          style={{ borderColor: "var(--border-default)" }}
        >
          <option value="">+ add predecessor…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/* ─── Inline deliverables editor (keyboard-driven, with sub-deliverables) ──
 *  Enter = new deliverable below (focused) · ↑/↓ = move between rows ·
 *  Tab = make sub-deliverable · ⇧Tab = outdent · ⌫ on empty = delete.        */

const MAX_DELIV_DEPTH = 2; // deliverable (0) → sub (1) → sub-sub (2)

type DelivRow = {
  id: string;
  title: string;
  done: boolean;
  dueDate: string | null;
  level: number;
  parentTaskId: string | null;
};

function flattenTasks(
  tasks: PlanDocTask[],
  level = 0,
  parent: string | null = null,
  out: DelivRow[] = [],
): DelivRow[] {
  for (const t of tasks) {
    out.push({ id: t.id, title: t.title, done: t.done, dueDate: t.dueDate, level, parentTaskId: parent });
    if (t.children.length) flattenTasks(t.children, level + 1, t.id, out);
  }
  return out;
}

function DeliverablesEditor({
  initiativeId,
  tasks,
}: {
  initiativeId: string;
  tasks: PlanDocTask[];
}) {
  const [, startTransition] = useTransition();
  const [focusId, setFocusId] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => flattenTasks(tasks), [tasks]);
  const parentOf = useMemo(() => new Map(rows.map((r) => [r.id, r.parentTaskId])), [rows]);

  // After a structural change re-renders with fresh data, focus the new row.
  useEffect(() => {
    if (!focusId) return;
    const el = boxRef.current?.querySelector<HTMLInputElement>(`input[data-deliv="${focusId}"]`);
    if (el) {
      el.focus();
      el.select();
      setFocusId(null);
    }
  }, [focusId, rows]);

  // ↑/↓ move focus across every editable row (deliverables + the add box).
  const moveFocus = (fromId: string, dir: 1 | -1) => {
    const c = boxRef.current;
    if (!c) return;
    const inputs = Array.from(c.querySelectorAll<HTMLInputElement>("input[data-deliv]"));
    const i = inputs.findIndex((el) => el.dataset.deliv === fromId);
    const next = inputs[i + dir];
    if (next) {
      next.focus();
      next.select();
    }
  };

  return (
    <div ref={boxRef}>
      <p className="text-tiny text-text-tertiary mb-1.5">
        Enter = new row · Tab = sub-deliverable · ↑↓ = move · /END 5/20 sets a date
      </p>
      <div className="space-y-0.5">
        {rows.map((row, idx) => (
          <DelivRow
            key={row.id}
            row={row}
            prev={rows[idx - 1]}
            initiativeId={initiativeId}
            parentOf={parentOf}
            moveFocus={moveFocus}
            setFocusId={setFocusId}
            startTransition={startTransition}
          />
        ))}
      </div>
      <InlineAddTask initiativeId={initiativeId} moveFocus={moveFocus} />
    </div>
  );
}

function DelivRow({
  row,
  prev,
  initiativeId,
  parentOf,
  moveFocus,
  setFocusId,
  startTransition,
}: {
  row: DelivRow;
  prev: DelivRow | undefined;
  initiativeId: string;
  parentOf: Map<string, string | null>;
  moveFocus: (fromId: string, dir: 1 | -1) => void;
  setFocusId: (id: string | null) => void;
  startTransition: (cb: () => void) => void;
}) {
  const [checked, setChecked] = useState(row.done);
  const [title, setTitle] = useState(row.title);
  useEffect(() => setChecked(row.done), [row.done]);
  useEffect(() => setTitle(row.title), [row.title]);

  const commit = () => {
    const { title: parsed, end } = parseDateTokens(title);
    const newTitle = parsed || row.title;
    const patch: Parameters<typeof updateRoadmapTask>[1] = {};
    if (newTitle !== row.title) patch.title = newTitle;
    if (end !== undefined) patch.dueDate = end;
    if (Object.keys(patch).length === 0) return;
    if (parsed && parsed !== title) setTitle(newTitle);
    startTransition(() => updateRoadmapTask(row.id, patch));
  };

  const addSibling = () => {
    commit();
    startTransition(async () => {
      const r = await createRoadmapTask({
        initiativeId,
        title: "",
        parentTaskId: row.parentTaskId ?? null,
      });
      if (r.id) setFocusId(r.id);
    });
  };

  const addChild = () => {
    if (row.level >= MAX_DELIV_DEPTH) return;
    commit();
    startTransition(async () => {
      const r = await createRoadmapTask({ initiativeId, title: "", parentTaskId: row.id });
      if (r.id) setFocusId(r.id);
    });
  };

  const remove = () => startTransition(() => deleteRoadmapTask(row.id));

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addSibling();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(row.id, 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(row.id, -1);
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        // outdent → become a sibling of the current parent
        if (row.parentTaskId) {
          commit();
          const grandparent = parentOf.get(row.parentTaskId) ?? null;
          startTransition(async () => {
            await reparentRoadmapTask(row.id, grandparent);
            setFocusId(row.id);
          });
        }
      } else {
        // indent → become a child of the previous sibling
        if (
          prev &&
          (prev.parentTaskId ?? null) === (row.parentTaskId ?? null) &&
          row.level < MAX_DELIV_DEPTH
        ) {
          commit();
          startTransition(async () => {
            await reparentRoadmapTask(row.id, prev.id);
            setFocusId(row.id);
          });
        }
      }
    } else if (e.key === "Backspace" && title === "") {
      e.preventDefault();
      remove();
    }
  };

  return (
    <div
      className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-surface"
      style={{ paddingLeft: `${row.level * 22 + 4}px` }}
    >
      {row.level > 0 && (
        <CornerDownRight size={12} className="shrink-0 text-text-tertiary opacity-40" />
      )}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          setChecked(e.target.checked);
          startTransition(() => toggleRoadmapTask(row.id, e.target.checked));
        }}
        className="shrink-0"
      />
      <input
        data-deliv={row.id}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        placeholder={row.level === 0 ? "Deliverable…" : "Sub-deliverable…"}
        className={`flex-1 min-w-0 bg-transparent text-[13px] outline-none placeholder:text-text-tertiary ${checked ? "line-through text-text-tertiary" : ""}`}
      />
      {row.level < MAX_DELIV_DEPTH && (
        <button
          type="button"
          onClick={addChild}
          title="Add sub-deliverable (or press Tab)"
          className="shrink-0 text-text-tertiary hover:text-text-primary opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          <Plus size={13} />
        </button>
      )}
      <button
        type="button"
        onClick={remove}
        title="Delete"
        className="shrink-0 text-text-tertiary hover:text-[var(--red-mid)] opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X size={13} />
      </button>
      <DateField
        value={row.dueDate}
        onChange={(v) => startTransition(() => updateRoadmapTask(row.id, { dueDate: v }))}
        placeholder="due"
      />
    </div>
  );
}

function InlineAddTask({
  initiativeId,
  moveFocus,
}: {
  initiativeId: string;
  moveFocus: (fromId: string, dir: 1 | -1) => void;
}) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const submit = () => {
    const raw = value.trim();
    if (!raw) return;
    setValue(""); // clear + keep focus → type the next one straight away
    // Support the inline date shortcut: "QA pass /END 5/20" or "ETA:5/20".
    const { title, end } = parseDateTokens(raw);
    startTransition(() =>
      createRoadmapTask({ initiativeId, title: title || raw, dueDate: end ?? null }).then(
        () => undefined,
      ),
    );
  };
  return (
    <div className="flex items-center gap-2 px-1 py-0.5 mt-0.5">
      <Plus size={13} className="text-text-tertiary shrink-0" />
      <input
        data-deliv="__add__"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            moveFocus("__add__", -1);
          }
        }}
        onBlur={submit}
        disabled={pending}
        placeholder="Add deliverable…  (try: QA pass /END 5/20)"
        className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-text-tertiary"
      />
    </div>
  );
}
