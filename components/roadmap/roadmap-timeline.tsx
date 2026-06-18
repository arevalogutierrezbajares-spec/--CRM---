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
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { CornerDownRight, Plus, Star, X, Zap } from "lucide-react";
import { useRoadmapSelection } from "./roadmap-selection";
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
import { MentionInput } from "@/components/ui/mention-input";
import { PersonChipStack } from "@/components/roadmap/mention-bubbles";

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
  const sel = useRoadmapSelection();

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
                          <div className="flex items-center min-w-0">
                          {sel.selectMode && (
                            <input
                              type="checkbox"
                              checked={sel.isSelected(item.id)}
                              onChange={() => sel.toggle(item.id, "init")}
                              className="ml-3 mr-1 shrink-0"
                              title="Select milestone for delete"
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => onSelect(isSel ? null : item.id)}
                            className={`min-w-0 pr-2 text-left flex items-center gap-2 ${sel.selectMode ? "pl-1" : "pl-3"}`}
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
                          </div>

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
                                  <DeliverablesEditor initiativeId={item.id} tasks={detail.tasks} members={members} />
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

/* ─── Inline deliverables editor (client-authoritative) ───────────────────
 *  The editor owns its list in local state and persists in the background, so
 *  edits are instant and rows never reorder/remount mid-write. Server writes
 *  run "quiet" (no full /roadmap revalidation); a single debounced
 *  router.refresh() syncs the timeline bar count + plan doc afterward.
 *
 *  Enter = new row below (focused) · ↑/↓ = move · Tab = sub-deliverable ·
 *  ⇧Tab = outdent · ⌫ on empty = delete.                                     */

const MAX_DELIV_DEPTH = 2; // deliverable (0) → sub (1) → sub-sub (2)

type ERow = {
  key: string; // stable client id — never changes, so no remount on save
  serverId: string | null; // real db id once the create resolves
  title: string;
  done: boolean;
  dueDate: string | null;
  level: number;
  parentKey: string | null;
};

let keySeq = 0;
const newKey = () => `k${keySeq++}`;

function seedRows(tasks: PlanDocTask[]): ERow[] {
  const out: ERow[] = [];
  const walk = (ts: PlanDocTask[], level: number, parentKey: string | null) => {
    for (const t of ts) {
      const key = t.id; // existing rows key by their server id (stable)
      out.push({
        key,
        serverId: t.id,
        title: t.title,
        done: t.done,
        dueDate: t.dueDate,
        level,
        parentKey,
      });
      if (t.children.length) walk(t.children, level + 1, key);
    }
  };
  walk(tasks, 0, null);
  return out;
}

/** Index just past `key` and all of its descendants. */
function endOfSubtree(rows: ERow[], key: string): number {
  const i = rows.findIndex((r) => r.key === key);
  if (i < 0) return rows.length;
  const base = rows[i].level;
  let j = i + 1;
  while (j < rows.length && rows[j].level > base) j++;
  return j;
}

function DeliverablesEditor({
  initiativeId,
  tasks,
  members,
}: {
  initiativeId: string;
  tasks: PlanDocTask[];
  members: Member[];
}) {
  const mentionPeople = useMemo(
    () => members.map((m) => ({ userId: m.id, displayName: m.displayName })),
    [members],
  );
  // Seed once per mount (reopening a milestone remounts → fresh seed). We do
  // NOT re-seed from props, so background revalidations never disturb edits.
  const [rows, setRows] = useState<ERow[]>(() => seedRows(tasks));
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const sel = useRoadmapSelection();

  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  });

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefreshRef = useRef<() => void>(() => {});

  // Server-id backfill plumbing: lets ops on a still-pending row (delete,
  // indent, rename) run as soon as the create resolves — no orphans, no lost edits.
  const waiters = useRef<Map<string, Array<(sid: string) => void>>>(new Map());
  const removedPending = useRef<Set<string>>(new Set());
  const settleServerId = (key: string, sid: string) => {
    if (removedPending.current.has(key)) {
      // Row was deleted before its create resolved → delete the server row now.
      removedPending.current.delete(key);
      void deleteRoadmapTask(sid, true).then(scheduleRefreshRef.current);
      return;
    }
    setRows((prev) => prev.map((x) => (x.key === key ? { ...x, serverId: sid } : x)));
    const ws = waiters.current.get(key);
    if (ws) {
      waiters.current.delete(key);
      ws.forEach((f) => f(sid));
    }
  };
  const withServerId = (key: string | null, cb: (sid: string | null) => void) => {
    if (key === null) {
      cb(null);
      return;
    }
    const row = rowsRef.current.find((r) => r.key === key);
    if (row?.serverId) {
      cb(row.serverId);
      return;
    }
    const arr = waiters.current.get(key) ?? [];
    arr.push((sid) => cb(sid));
    waiters.current.set(key, arr);
  };

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 1200);
  }, [router]);
  scheduleRefreshRef.current = scheduleRefresh;
  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  // Focus a freshly-created row once it renders (key is stable, so this fires
  // on the optimistic insert — no wait for the server).
  useEffect(() => {
    if (!focusKey) return;
    const el = boxRef.current?.querySelector<HTMLInputElement>(`input[data-key="${focusKey}"]`);
    if (el) {
      el.focus();
      el.select();
      setFocusKey(null);
    }
  }, [focusKey, rows]);

  const serverIdOf = (key: string | null) =>
    key ? (rowsRef.current.find((r) => r.key === key)?.serverId ?? null) : null;

  const moveFocus = (fromKey: string, dir: 1 | -1) => {
    const c = boxRef.current;
    if (!c) return;
    const inputs = Array.from(c.querySelectorAll<HTMLInputElement>("input[data-key]"));
    const i = inputs.findIndex((el) => el.dataset.key === fromKey);
    const next = inputs[i + dir];
    if (next) {
      next.focus();
      next.select();
    }
  };

  const addRow = (opts: {
    afterKey: string | null;
    level: number;
    parentKey: string | null;
    title?: string;
    dueDate?: string | null;
    focus?: boolean;
  }) => {
    const key = newKey();
    const row: ERow = {
      key,
      serverId: null,
      title: opts.title ?? "",
      done: false,
      dueDate: opts.dueDate ?? null,
      level: opts.level,
      parentKey: opts.parentKey,
    };
    setRows((prev) => {
      if (opts.afterKey === null) return [...prev, row];
      const idx = endOfSubtree(prev, opts.afterKey);
      const copy = [...prev];
      copy.splice(idx, 0, row);
      return copy;
    });
    if (opts.focus !== false) setFocusKey(key);

    // Resolve the parent's server id first (it may itself still be creating),
    // then create — so a sub-deliverable under a brand-new deliverable works.
    withServerId(opts.parentKey, (parentServerId) => {
      void (async () => {
        const r = await createRoadmapTask({
          initiativeId,
          title: opts.title ?? "",
          parentTaskId: parentServerId,
          dueDate: opts.dueDate ?? null,
          quiet: true,
        });
        if (r.id) settleServerId(key, r.id);
        scheduleRefresh();
      })();
    });
  };

  const saveRow = (key: string) => {
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    const { title: parsed, end } = parseDateTokens(row.title);
    const newTitle = parsed || row.title;
    const changedTitle = newTitle !== row.title;
    const changedDate = end !== undefined;
    if (changedTitle || changedDate) {
      setRows((prev) =>
        prev.map((r) =>
          r.key === key
            ? { ...r, title: newTitle, dueDate: changedDate ? (end as string) : r.dueDate }
            : r,
        ),
      );
    }
    const patch: { title?: string; dueDate?: string | null } = {};
    if (newTitle) patch.title = newTitle;
    if (changedDate) patch.dueDate = end as string;
    if (Object.keys(patch).length === 0) return;
    withServerId(key, (sid) => sid && void updateRoadmapTask(sid, patch, true).then(scheduleRefresh));
  };

  const setTitle = (key: string, title: string) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, title } : r)));

  const setDue = (key: string, due: string | null) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, dueDate: due } : r)));
    withServerId(key, (sid) => sid && void updateRoadmapTask(sid, { dueDate: due }, true).then(scheduleRefresh));
  };

  const toggleDone = (key: string, done: boolean) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, done } : r)));
    const sid = serverIdOf(key);
    if (sid) void toggleRoadmapTask(sid, done, true).then(scheduleRefresh);
  };

  const removeRow = (key: string) => {
    const sid = serverIdOf(key);
    setRows((prev) => {
      const i = prev.findIndex((r) => r.key === key);
      if (i < 0) return prev;
      const end = endOfSubtree(prev, key);
      return [...prev.slice(0, i), ...prev.slice(end)];
    });
    if (sid) void deleteRoadmapTask(sid, true).then(scheduleRefresh);
    else removedPending.current.add(key); // create still in flight → delete on backfill
  };

  // Blur of a never-typed new row → drop it (no "New deliverable" clutter).
  const cleanupIfEmpty = (key: string) => {
    const cur = rowsRef.current;
    const i = cur.findIndex((r) => r.key === key);
    if (i < 0) return;
    const row = cur[i];
    if (!/^k\d+$/.test(key)) return; // only locally-created rows
    if (row.title.trim() !== "" || endOfSubtree(cur, key) > i + 1) return; // has text or children
    removeRow(key);
  };

  // Keys of `key` plus all its descendants (a contiguous block in `rows`).
  const subtreeKeys = (src: ERow[], key: string): Set<string> => {
    const i = src.findIndex((r) => r.key === key);
    if (i < 0) return new Set();
    const end = endOfSubtree(src, key);
    return new Set(src.slice(i, end).map((r) => r.key));
  };

  const indentRow = (key: string) => {
    const i = rows.findIndex((r) => r.key === key);
    if (i <= 0) return;
    const row = rows[i];
    if (row.level >= MAX_DELIV_DEPTH) return;
    // previous sibling = nearest earlier row at the same level + parent
    let p = i - 1;
    while (p >= 0 && !(rows[p].level === row.level && rows[p].parentKey === row.parentKey)) {
      if (rows[p].level < row.level) return; // first child — can't indent
      p--;
    }
    if (p < 0) return;
    const prevSib = rows[p];
    const sub = subtreeKeys(rows, key);
    setRows((prev) =>
      prev.map((r) => {
        if (r.key === key) return { ...r, level: r.level + 1, parentKey: prevSib.key };
        if (sub.has(r.key)) return { ...r, level: r.level + 1 }; // descendants shift too
        return r;
      }),
    );
    saveRow(key);
    withServerId(key, (sid) => {
      if (!sid) return;
      withServerId(prevSib.key, (psid) => {
        if (psid) void reparentRoadmapTask(sid, psid, true).then(scheduleRefresh);
      });
    });
    setFocusKey(key);
  };

  const outdentRow = (key: string) => {
    const row = rows.find((r) => r.key === key);
    if (!row || row.parentKey === null) return;
    const parent = rows.find((r) => r.key === row.parentKey);
    const grandparentKey = parent?.parentKey ?? null;
    const sub = subtreeKeys(rows, key);
    setRows((prev) =>
      prev.map((r) => {
        if (r.key === key)
          return { ...r, level: Math.max(0, r.level - 1), parentKey: grandparentKey };
        if (sub.has(r.key)) return { ...r, level: Math.max(0, r.level - 1) };
        return r;
      }),
    );
    saveRow(key);
    withServerId(key, (sid) => {
      if (!sid) return;
      withServerId(grandparentKey, (gsid) =>
        void reparentRoadmapTask(sid, gsid, true).then(scheduleRefresh),
      );
    });
    setFocusKey(key);
  };

  return (
    <div ref={boxRef}>
      <p className="text-tiny text-text-tertiary mb-1.5">
        Enter = new row · Tab = sub-deliverable · ↑↓ = move · @ to tag · #9/21 or #10 (business days) sets a due date
      </p>
      <div className="space-y-0.5">
        {rows.map((row) => (
          <DelivRow
            key={row.key}
            row={row}
            mentionPeople={mentionPeople}
            selectMode={sel.selectMode}
            isSelected={row.serverId ? sel.isSelected(row.serverId) : false}
            onToggleSelect={() => row.serverId && sel.toggle(row.serverId, "task")}
            setTitle={setTitle}
            saveRow={saveRow}
            onBlur={(k) => {
              saveRow(k);
              cleanupIfEmpty(k);
            }}
            setDue={setDue}
            toggleDone={toggleDone}
            removeRow={removeRow}
            moveFocus={moveFocus}
            onEnter={() =>
              addRow({ afterKey: row.key, level: row.level, parentKey: row.parentKey, focus: true })
            }
            onAddChild={() =>
              addRow({ afterKey: row.key, level: row.level + 1, parentKey: row.key, focus: true })
            }
            onIndent={() => indentRow(row.key)}
            onOutdent={() => outdentRow(row.key)}
          />
        ))}
      </div>
      <InlineAddTask
        moveFocus={moveFocus}
        mentionPeople={mentionPeople}
        onAdd={(title, dueDate) =>
          addRow({ afterKey: null, level: 0, parentKey: null, title, dueDate, focus: false })
        }
      />
    </div>
  );
}

function DelivRow({
  row,
  mentionPeople,
  selectMode,
  isSelected,
  onToggleSelect,
  setTitle,
  saveRow,
  onBlur,
  setDue,
  toggleDone,
  removeRow,
  moveFocus,
  onEnter,
  onAddChild,
  onIndent,
  onOutdent,
}: {
  row: ERow;
  mentionPeople: Array<{ userId: string; displayName: string }>;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  setTitle: (key: string, title: string) => void;
  saveRow: (key: string) => void;
  onBlur: (key: string) => void;
  setDue: (key: string, due: string | null) => void;
  toggleDone: (key: string, done: boolean) => void;
  removeRow: (key: string) => void;
  moveFocus: (fromKey: string, dir: 1 | -1) => void;
  onEnter: () => void;
  onAddChild: () => void;
  onIndent: () => void;
  onOutdent: () => void;
}) {
  const pending = row.serverId === null;
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveRow(row.key);
      onEnter();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(row.key, 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(row.key, -1);
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) onOutdent();
      else onIndent(); // indentRow validates there's a previous sibling
    } else if (e.key === "Backspace" && row.title === "") {
      e.preventDefault();
      removeRow(row.key);
    }
  };

  return (
    <div
      className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-surface"
      style={{
        paddingLeft: `${row.level * 22 + 4}px`,
        background: isSelected ? "color-mix(in oklab, var(--red-mid) 12%, transparent)" : undefined,
      }}
    >
      {selectMode && !pending && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="shrink-0"
          title="Select for delete"
        />
      )}
      {row.level > 0 && (
        <CornerDownRight size={12} className="shrink-0 text-text-tertiary opacity-40" />
      )}
      <input
        type="checkbox"
        checked={row.done}
        onChange={(e) => toggleDone(row.key, e.target.checked)}
        className="shrink-0"
        title="Mark done"
      />
      <MentionInput
        value={row.title}
        onChange={(v) => setTitle(row.key, v)}
        onBlur={() => onBlur(row.key)}
        onKeyDown={onKeyDown}
        sources={{ people: mentionPeople, projects: [], docs: [] }}
        placeholder={row.level === 0 ? "Deliverable…  (@ to tag · # for a due date)" : "Sub-deliverable…  (@ · #)"}
        className="flex-1 min-w-0"
        inputClassName={`w-full bg-transparent text-[13px] outline-none placeholder:text-text-tertiary ${row.done ? "line-through text-text-tertiary" : ""}`}
        inputProps={{ "data-key": row.key }}
      />
      <PersonChipStack text={row.title} members={mentionPeople} />
      {row.level < MAX_DELIV_DEPTH && (
        <button
          type="button"
          onClick={onAddChild}
          title="Add sub-deliverable (or press Tab)"
          className="shrink-0 text-text-tertiary hover:text-text-primary opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          <Plus size={13} />
        </button>
      )}
      <button
        type="button"
        onClick={() => removeRow(row.key)}
        title="Delete"
        className="shrink-0 text-text-tertiary hover:text-[var(--red-mid)] opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X size={13} />
      </button>
      <DateField value={row.dueDate} onChange={(v) => setDue(row.key, v)} placeholder="due" />
    </div>
  );
}

function InlineAddTask({
  moveFocus,
  mentionPeople,
  onAdd,
}: {
  moveFocus: (fromKey: string, dir: 1 | -1) => void;
  mentionPeople: Array<{ userId: string; displayName: string }>;
  onAdd: (title: string, dueDate: string | null) => void;
}) {
  const [value, setValue] = useState("");
  const submit = () => {
    const raw = value.trim();
    if (!raw) return;
    setValue(""); // clear + keep focus → type the next one straight away
    const { title, end } = parseDateTokens(raw);
    onAdd(title || raw, end ?? null);
  };
  return (
    <div className="flex items-center gap-2 px-1 py-0.5 mt-0.5">
      <Plus size={13} className="text-text-tertiary shrink-0" />
      <MentionInput
        value={value}
        onChange={setValue}
        sources={{ people: mentionPeople, projects: [], docs: [] }}
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
        placeholder="Add deliverable…  (@ to tag · #9/21 or #10 for a due date)"
        className="flex-1 min-w-0"
        inputClassName="w-full bg-transparent text-[13px] outline-none placeholder:text-text-tertiary"
        inputProps={{ "data-key": "__add__" }}
      />
    </div>
  );
}
