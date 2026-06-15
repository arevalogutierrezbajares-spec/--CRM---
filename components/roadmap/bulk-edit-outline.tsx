"use client";

/**
 * Bulk-edit outline — a fast, keyboard-driven AND drag-and-drop indented editor
 * over the whole roadmap hierarchy (LoB → milestone → deliverable → sub-deliverable).
 *
 * Client-authoritative: local state owns the list so edits are instant and rows
 * never reorder/remount mid-write. Writes run "quiet" (no full /roadmap
 * revalidation); a single debounced router.refresh() syncs other surfaces.
 *
 *   • type to rename (saves on blur / Enter)
 *   • Enter      → new sibling below (auto-focused)
 *   • ↑ / ↓      → move between rows
 *   • Tab / ⇧Tab → indent / outdent (within a milestone's task tree)
 *   • drag the ⋮⋮ handle → move a deliverable to any milestone/LoB (drag right
 *     to nest), or move a milestone to a different LoB
 *   • the + buttons add a child; × (or ⌫ on an empty row) deletes
 *   • /END 5/4, /START, ETA:5/4 in the title set dates
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, GripVertical, Plus, X } from "lucide-react";
import type { PlanDocData, PlanDocInitiative, PlanDocTask } from "@/db/queries/roadmap";
import { fmtChip, parseDateTokens } from "@/lib/roadmap-dates";
import {
  createInitiative,
  createLob,
  createRoadmapTask,
  deleteInitiative,
  deleteLob,
  deleteRoadmapTask,
  moveInitiative,
  moveRoadmapTask,
  renameLob,
  reorderLobs,
  reparentRoadmapTask,
  updateInitiativeFields,
  updateRoadmapTask,
} from "@/app/(app)/roadmap/actions";

type RowKind = "lob" | "init" | "task";
type ERow = {
  key: string;
  serverId: string | null;
  kind: RowKind;
  title: string;
  level: number; // 0 lob · 1 init · 2 deliverable · 3 sub
  lobKey: string | null;
  initKey: string | null;
  parentTaskKey: string | null;
  startDate: string | null;
  endDate: string | null;
  isLobNone: boolean;
};

const MAX_TASK_LEVEL = 3;
const NONE_KEY = "__none__";
const INDENT = 22;
let kseq = 0;
const nk = () => `b${kseq++}`;

function seed(data: PlanDocData): ERow[] {
  const rows: ERow[] = [];
  const byLob = new Map<string | null, PlanDocInitiative[]>();
  for (const i of data.initiatives) {
    const k = i.lobId ?? null;
    const arr = byLob.get(k) ?? [];
    arr.push(i);
    byLob.set(k, arr);
  }
  const walkTasks = (tasks: PlanDocTask[], initKey: string, parentTaskKey: string | null, level: number) => {
    for (const t of tasks) {
      rows.push({
        key: t.id, serverId: t.id, kind: "task", title: t.title, level,
        lobKey: null, initKey, parentTaskKey, startDate: null, endDate: t.dueDate, isLobNone: false,
      });
      if (t.children.length) walkTasks(t.children, initKey, t.id, level + 1);
    }
  };
  const emitInits = (lobServerId: string | null, lobKey: string | null) => {
    for (const init of byLob.get(lobServerId) ?? []) {
      rows.push({
        key: init.id, serverId: init.id, kind: "init", title: init.title, level: 1,
        lobKey, initKey: null, parentTaskKey: null, startDate: init.startDate, endDate: init.targetEndDate, isLobNone: false,
      });
      walkTasks(init.tasks, init.id, null, 2);
    }
  };
  for (const lob of data.lobs) {
    rows.push({
      key: lob.id, serverId: lob.id, kind: "lob", title: lob.title, level: 0,
      lobKey: lob.id, initKey: null, parentTaskKey: null, startDate: null, endDate: null, isLobNone: false,
    });
    emitInits(lob.id, lob.id);
  }
  if ((byLob.get(null) ?? []).length) {
    rows.push({
      key: NONE_KEY, serverId: null, kind: "lob", title: "Cross-venture (no line of business)", level: 0,
      lobKey: null, initKey: null, parentTaskKey: null, startDate: null, endDate: null, isLobNone: true,
    });
    emitInits(null, null);
  }
  return rows;
}

/** Index just past `key` and all of its descendants (lower in the tree). */
function endOfSubtree(rows: ERow[], key: string): number {
  const i = rows.findIndex((r) => r.key === key);
  if (i < 0) return rows.length;
  const base = rows[i].level;
  let j = i + 1;
  while (j < rows.length && rows[j].level > base) j++;
  return j;
}

function subtreeKeySet(rows: ERow[], key: string): Set<string> {
  const i = rows.findIndex((r) => r.key === key);
  if (i < 0) return new Set();
  return new Set(rows.slice(i, endOfSubtree(rows, key)).map((r) => r.key));
}

type Projection =
  | { kind: "task"; depth: number; initKey: string; parentTaskKey: string | null; afterKey: string | null }
  | { kind: "init"; depth: 1; lobKey: string | null; afterKey: string | null }
  | { kind: "lob"; depth: 0; afterKey: string | null }
  | null;

/** Where the dragged row would land, given the over row + horizontal offset. */
function getProjection(
  visible: ERow[],
  activeKey: string,
  overKey: string,
  offsetX: number,
): Projection {
  const aIdx = visible.findIndex((r) => r.key === activeKey);
  const oIdx = visible.findIndex((r) => r.key === overKey);
  if (aIdx < 0 || oIdx < 0) return null;
  const reordered = arrayMove(visible, aIdx, oIdx);
  const pos = oIdx;
  const active = visible[aIdx];
  const prev = reordered[pos - 1];
  const next = reordered[pos + 1];
  const afterKey = prev?.key ?? null;

  if (active.kind === "lob") {
    // Reorder among LoBs; afterKey must be another LoB (or top). The synthetic
    // Cross-venture header (isLobNone) can't be reordered past.
    if (prev && prev.kind !== "lob") return null;
    if (prev?.isLobNone) return null;
    return { kind: "lob", depth: 0, afterKey };
  }

  if (active.kind === "init") {
    let lobKey: string | null = null;
    for (let k = pos - 1; k >= 0; k--) {
      if (reordered[k].kind === "lob") {
        lobKey = reordered[k].isLobNone ? null : reordered[k].key;
        break;
      }
    }
    return { kind: "init", depth: 1, lobKey, afterKey };
  }

  // task
  if (!prev || prev.kind === "lob") return null; // a task needs a milestone above it
  const dragDepth = Math.round(offsetX / INDENT);
  const maxDepth = prev.kind === "init" ? 2 : Math.min(MAX_TASK_LEVEL, prev.level + 1);
  const minDepth = next && next.kind === "task" ? Math.max(2, next.level) : 2;
  const depth = Math.max(minDepth, Math.min(maxDepth, active.level + dragDepth));

  let initKey: string | null = null;
  for (let k = pos - 1; k >= 0; k--) {
    if (reordered[k].kind === "init") {
      initKey = reordered[k].key;
      break;
    }
    if (reordered[k].kind === "lob") break;
  }
  if (!initKey) return null;

  let parentTaskKey: string | null = null;
  if (depth === 3) {
    for (let k = pos - 1; k >= 0; k--) {
      const it = reordered[k];
      if (it.kind === "init") break;
      if (it.kind === "task" && it.level === 2) {
        parentTaskKey = it.key;
        break;
      }
    }
    if (!parentTaskKey) return null;
  }
  return { kind: "task", depth, initKey, parentTaskKey, afterKey };
}

/** Apply a drop: relocate the active subtree block + re-home/relevel it. */
function moveBlock(rows: ERow[], activeKey: string, proj: NonNullable<Projection>): ERow[] {
  const i = rows.findIndex((r) => r.key === activeKey);
  if (i < 0) return rows;
  const end = endOfSubtree(rows, activeKey);
  const block = rows.slice(i, end).map((r) => ({ ...r }));
  const active = block[0];
  const delta = proj.depth - active.level;
  active.level = proj.depth;
  if (proj.kind === "task") {
    active.initKey = proj.initKey;
    active.parentTaskKey = proj.parentTaskKey;
  } else if (proj.kind === "init") {
    active.lobKey = proj.lobKey;
  } // proj.kind === "lob": position only, no field change
  for (let k = 1; k < block.length; k++) {
    block[k].level += delta;
    if (proj.kind === "task") block[k].initKey = proj.initKey;
  }
  const rest = [...rows.slice(0, i), ...rows.slice(end)];
  let insertAt: number;
  if (proj.afterKey == null) insertAt = 0;
  else {
    const ai = rest.findIndex((r) => r.key === proj.afterKey);
    if (ai < 0) insertAt = rest.length;
    else if (rest[ai].level < proj.depth)
      insertAt = ai + 1; // dropping as the first child — right after the container header
    else insertAt = endOfSubtree(rest, proj.afterKey); // after a sibling's whole subtree
  }
  return [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
}

export function BulkEditOutline({ data }: { data: PlanDocData }) {
  const [rows, setRows] = useState<ERow[]>(() => seed(data));
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  });

  const wantReseed = useRef(false);
  useEffect(() => {
    if (wantReseed.current) {
      wantReseed.current = false;
      setRows(seed(data));
    }
  }, [data]);

  const waiters = useRef<Map<string, Array<(sid: string) => void>>>(new Map());
  const setServerId = (key: string, sid: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, serverId: sid } : r)));
    const ws = waiters.current.get(key);
    if (ws) {
      waiters.current.delete(key);
      ws.forEach((f) => f(sid));
    }
  };
  const withServerId = useCallback((key: string | null, cb: (sid: string | null) => void) => {
    if (key === null || key === NONE_KEY) {
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
  }, []);

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 1200);
  }, [router]);
  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  useEffect(() => {
    if (!focusKey) return;
    const el = boxRef.current?.querySelector<HTMLInputElement>(`input[data-key="${focusKey}"]`);
    if (el) {
      el.focus();
      el.select();
      setFocusKey(null);
    }
  }, [focusKey, rows]);

  const moveFocus = (fromKey: string, dir: 1 | -1) => {
    const c = boxRef.current;
    if (!c) return;
    const inputs = Array.from(c.querySelectorAll<HTMLInputElement>("input[data-key]:not([disabled])"));
    const idx = inputs.findIndex((el) => el.dataset.key === fromKey);
    const next = inputs[idx + dir];
    if (next) {
      next.focus();
      next.select();
    }
  };

  const insertAfter = (afterKey: string | null, row: ERow) =>
    setRows((prev) => {
      if (afterKey === null) return [...prev, row];
      const idx = endOfSubtree(prev, afterKey);
      const copy = [...prev];
      copy.splice(idx, 0, row);
      return copy;
    });

  const mkRow = (over: Partial<ERow>): ERow => ({
    key: nk(), serverId: null, kind: "task", title: "", level: 0,
    lobKey: null, initKey: null, parentTaskKey: null, startDate: null, endDate: null, isLobNone: false, ...over,
  });

  const addLob = (afterKey: string | null) => {
    const row = mkRow({ kind: "lob", level: 0 });
    row.lobKey = row.key;
    insertAfter(afterKey, row);
    setFocusKey(row.key);
    void createLob("", true).then((r) => {
      if (r.id) setServerId(row.key, r.id);
      scheduleRefresh();
    });
  };

  const addInit = (lobKey: string | null, afterKey: string | null) => {
    const row = mkRow({ kind: "init", level: 1, lobKey: lobKey === NONE_KEY ? null : lobKey });
    insertAfter(afterKey, row);
    setFocusKey(row.key);
    withServerId(lobKey, (lobSid) => {
      void createInitiative({ lobId: lobSid, title: "", quiet: true }).then((r) => {
        if (r.id) setServerId(row.key, r.id);
        scheduleRefresh();
      });
    });
  };

  const addTask = (initKey: string, parentTaskKey: string | null, level: number, afterKey: string | null) => {
    const row = mkRow({ kind: "task", level, initKey, parentTaskKey });
    insertAfter(afterKey, row);
    setFocusKey(row.key);
    withServerId(initKey, (initSid) => {
      if (!initSid) return;
      withServerId(parentTaskKey, (parentSid) => {
        void createRoadmapTask({ initiativeId: initSid, title: "", parentTaskId: parentSid, quiet: true }).then((r) => {
          if (r.id) setServerId(row.key, r.id);
          scheduleRefresh();
        });
      });
    });
  };

  const setTitle = (key: string, title: string) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, title } : r)));

  const commit = (key: string) => {
    const row = rowsRef.current.find((r) => r.key === key);
    if (!row || row.isLobNone) return;
    const { title: parsed, start, end } = parseDateTokens(row.title);
    const newTitle = parsed || row.title;
    setRows((prev) =>
      prev.map((r) =>
        r.key === key
          ? {
              ...r, title: newTitle,
              startDate: row.kind === "init" && start !== undefined ? start : r.startDate,
              endDate: end !== undefined ? end : r.endDate,
            }
          : r,
      ),
    );
    const persist = (sid: string) => {
      if (row.kind === "lob") {
        if (newTitle) void renameLob(sid, newTitle, true).then(scheduleRefresh);
      } else if (row.kind === "init") {
        const patch: Parameters<typeof updateInitiativeFields>[1] = {};
        if (newTitle) patch.title = newTitle;
        if (start !== undefined) patch.startDate = start;
        if (end !== undefined) patch.targetEndDate = end;
        if (Object.keys(patch).length) void updateInitiativeFields(sid, patch, true).then(scheduleRefresh);
      } else {
        const patch: Parameters<typeof updateRoadmapTask>[1] = {};
        if (newTitle) patch.title = newTitle;
        if (end !== undefined) patch.dueDate = end;
        if (Object.keys(patch).length) void updateRoadmapTask(sid, patch, true).then(scheduleRefresh);
      }
    };
    if (row.serverId) persist(row.serverId);
    else withServerId(key, (sid) => sid && persist(sid));
  };

  const remove = (key: string) => {
    const row = rowsRef.current.find((r) => r.key === key);
    if (!row || row.isLobNone) return;
    if (row.kind === "lob" && !confirm("Delete this line of business? Its milestones move to Cross-venture.")) return;
    if (row.kind === "init" && !confirm("Delete this milestone and all its deliverables?")) return;

    if (row.kind === "lob") {
      setRows((prev) => prev.filter((r) => r.key !== key));
      if (row.serverId) {
        wantReseed.current = true;
        void deleteLob(row.serverId, false).then(() => router.refresh());
      }
      return;
    }
    setRows((prev) => {
      const i = prev.findIndex((r) => r.key === key);
      if (i < 0) return prev;
      return [...prev.slice(0, i), ...prev.slice(endOfSubtree(prev, key))];
    });
    const del = (sid: string) => {
      if (row.kind === "init") void deleteInitiative(sid, true).then(scheduleRefresh);
      else void deleteRoadmapTask(sid, true).then(scheduleRefresh);
    };
    if (row.serverId) del(row.serverId);
    else withServerId(key, (sid) => sid && del(sid)); // create in flight → delete on backfill
  };

  const indent = (key: string) => {
    const cur = rowsRef.current;
    const i = cur.findIndex((r) => r.key === key);
    const row = cur[i];
    if (!row || row.kind !== "task" || row.level >= MAX_TASK_LEVEL) return;
    let p = i - 1;
    while (
      p >= 0 &&
      !(cur[p].kind === "task" && cur[p].initKey === row.initKey && (cur[p].parentTaskKey ?? null) === (row.parentTaskKey ?? null) && cur[p].level === row.level)
    ) {
      if (cur[p].level < row.level) return;
      p--;
    }
    if (p < 0) return;
    const prevSib = cur[p];
    const sub = subtreeKeySet(cur, key);
    commit(key);
    setRows((prev) =>
      prev.map((r) => {
        if (r.key === key) return { ...r, level: r.level + 1, parentTaskKey: prevSib.key };
        if (sub.has(r.key)) return { ...r, level: r.level + 1 };
        return r;
      }),
    );
    setFocusKey(key);
    withServerId(key, (sid) => {
      if (!sid) return;
      withServerId(prevSib.key, (psid) => {
        if (psid) void reparentRoadmapTask(sid, psid, true).then(scheduleRefresh);
      });
    });
  };

  const outdent = (key: string) => {
    const cur = rowsRef.current;
    const row = cur.find((r) => r.key === key);
    if (!row || row.kind !== "task" || row.parentTaskKey === null) return;
    const parent = cur.find((r) => r.key === row.parentTaskKey);
    const grandparentKey = parent?.parentTaskKey ?? null;
    const sub = subtreeKeySet(cur, key);
    commit(key);
    setRows((prev) =>
      prev.map((r) => {
        if (r.key === key) return { ...r, level: Math.max(2, r.level - 1), parentTaskKey: grandparentKey };
        if (sub.has(r.key)) return { ...r, level: Math.max(2, r.level - 1) };
        return r;
      }),
    );
    setFocusKey(key);
    withServerId(key, (sid) => {
      if (!sid) return;
      withServerId(grandparentKey, (gsid) => void reparentRoadmapTask(sid, gsid, true).then(scheduleRefresh));
    });
  };

  const addSibling = (row: ERow) => {
    if (row.kind === "lob") addLob(row.isLobNone ? null : row.key);
    else if (row.kind === "init") addInit(row.lobKey, row.key);
    else addTask(row.initKey!, row.parentTaskKey ?? null, row.level, row.key);
  };
  const addChild = (row: ERow) => {
    if (row.kind === "lob") addInit(row.isLobNone ? null : row.key, row.key);
    else if (row.kind === "init") addTask(row.key, null, 2, row.key);
    else if (row.level < MAX_TASK_LEVEL) addTask(row.initKey!, row.key, row.level + 1, row.key);
  };

  // ── Drag and drop ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // While dragging, hide the active node's descendants (they travel with it).
  const displayRows = useMemo(() => {
    if (!activeKey) return rows;
    const sub = subtreeKeySet(rows, activeKey);
    sub.delete(activeKey);
    return rows.filter((r) => !sub.has(r.key));
  }, [rows, activeKey]);

  const projection = useMemo(() => {
    if (!activeKey || !overKey) return null;
    return getProjection(displayRows, activeKey, overKey, offsetX);
  }, [activeKey, overKey, offsetX, displayRows]);

  const onDragStart = (e: DragStartEvent) => {
    setActiveKey(String(e.active.id));
    setOverKey(String(e.active.id));
    setOffsetX(0);
  };
  const onDragMove = (e: DragMoveEvent) => {
    setOffsetX(e.delta.x);
    if (e.over) setOverKey(String(e.over.id));
  };
  const onDragEnd = (e: DragEndEvent) => {
    const aKey = activeKey;
    const proj = projection;
    setActiveKey(null);
    setOverKey(null);
    setOffsetX(0);
    if (!aKey || !proj || !e.over) return;

    const next = moveBlock(rowsRef.current, aKey, proj);
    setRows(next);
    const moved = next.find((r) => r.key === aKey);
    if (!moved) return;

    if (moved.kind === "task") {
      const sibs = next.filter(
        (r) => r.kind === "task" && r.initKey === moved.initKey && (r.parentTaskKey ?? null) === (moved.parentTaskKey ?? null),
      );
      const doMove = () =>
        withServerId(moved.initKey, (initSid) => {
          if (!initSid) return;
          withServerId(moved.parentTaskKey, (pSid) => {
            const orderedSiblingIds = sibs.map((r) => r.serverId).filter((x): x is string => !!x);
            if (moved.serverId)
              void moveRoadmapTask(moved.serverId, { initiativeId: initSid, parentMilestoneId: pSid, orderedSiblingIds }, true).then(scheduleRefresh);
          });
        });
      if (moved.serverId) doMove();
      else withServerId(aKey, () => doMove());
    } else if (moved.kind === "init") {
      // milestones sharing the moved one's LoB, in final order → renumber
      const sibs = next.filter((r) => r.kind === "init" && (r.lobKey ?? null) === (moved.lobKey ?? null));
      const persist = (sid: string) =>
        withServerId(moved.lobKey, (lobSid) => {
          const orderedSiblingIds = sibs.map((r) => r.serverId).filter((x): x is string => !!x);
          void moveInitiative(sid, { lobId: lobSid, orderedSiblingIds }, true).then(scheduleRefresh);
        });
      if (moved.serverId) persist(moved.serverId);
      else withServerId(aKey, (sid) => sid && persist(sid));
    } else if (moved.kind === "lob") {
      const orderedIds = next
        .filter((r) => r.kind === "lob" && !r.isLobNone)
        .map((r) => r.serverId)
        .filter((x): x is string => !!x);
      void reorderLobs(orderedIds, true).then(scheduleRefresh);
    }
  };

  const activeRow = activeKey ? rows.find((r) => r.key === activeKey) : null;

  return (
    <div className="rounded-lg border bg-card p-3" style={{ borderColor: "var(--border-default)" }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-tiny text-text-tertiary">
          Enter = new row · ↑↓ = move · Tab / ⇧Tab = indent/outdent · drag ⋮⋮ to move across milestones/LoBs · /END 5/4 sets dates
        </p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveKey(null);
          setOverKey(null);
          setOffsetX(0);
        }}
      >
        <SortableContext items={displayRows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
          <div className="space-y-0.5" ref={boxRef}>
            {displayRows.map((row) => (
              <OutlineRow
                key={row.key}
                row={row}
                projectedDepth={activeKey === row.key && projection ? projection.depth : null}
                dragValid={activeKey === row.key ? projection != null : null}
                setTitle={setTitle}
                commit={commit}
                remove={remove}
                addSibling={addSibling}
                addChild={addChild}
                indent={indent}
                outdent={outdent}
                moveFocus={moveFocus}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeRow ? (
            <div
              className="flex items-center gap-1.5 rounded bg-card px-2 py-0.5 shadow-lg border text-[13px] text-text-primary"
              style={{ borderColor: "var(--border-default)" }}
            >
              <GripVertical size={13} className="text-text-tertiary" />
              {activeRow.title || (activeRow.kind === "init" ? "Milestone" : "Deliverable")}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <button
        type="button"
        onClick={() => addLob(null)}
        className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-text-primary"
      >
        <Plus size={14} /> Add line of business
      </button>
    </div>
  );
}

function OutlineRow({
  row,
  projectedDepth,
  dragValid,
  setTitle,
  commit,
  remove,
  addSibling,
  addChild,
  indent,
  outdent,
  moveFocus,
}: {
  row: ERow;
  projectedDepth: number | null;
  dragValid: boolean | null;
  setTitle: (key: string, title: string) => void;
  commit: (key: string) => void;
  remove: (key: string) => void;
  addSibling: (row: ERow) => void;
  addChild: (row: ERow) => void;
  indent: (key: string) => void;
  outdent: (key: string) => void;
  moveFocus: (fromKey: string, dir: 1 | -1) => void;
}) {
  const isLobNone = row.isLobNone;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.key,
    disabled: isLobNone,
  });

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(row.key);
      addSibling(row);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(row.key, 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(row.key, -1);
    } else if (e.key === "Tab" && row.kind === "task") {
      e.preventDefault();
      if (e.shiftKey) outdent(row.key);
      else indent(row.key);
    } else if (e.key === "Backspace" && row.title === "" && !isLobNone) {
      e.preventDefault();
      remove(row.key);
    }
  };

  const fontByKind =
    row.kind === "lob"
      ? "text-[13px] font-semibold uppercase tracking-wider text-text-secondary"
      : row.kind === "init"
        ? "text-[13.5px] font-medium text-text-primary"
        : "text-[13px] text-text-primary";

  // While this row is the one being dragged, preview its projected indent.
  const level = projectedDepth ?? row.level;
  const invalid = dragValid === false;

  return (
    <div
      ref={setNodeRef}
      className="group flex items-center gap-1 rounded px-1 py-0.5 hover:bg-surface"
      style={{
        paddingLeft: `${level * INDENT + 4}px`,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        outline: invalid ? "1px dashed var(--red-mid)" : undefined,
      }}
    >
      {!isLobNone && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          title="Drag to move"
          className="shrink-0 cursor-grab active:cursor-grabbing text-text-tertiary hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity touch-none"
        >
          <GripVertical size={13} />
        </button>
      )}
      {row.kind !== "lob" && <ChevronRight size={12} className="text-text-tertiary shrink-0 opacity-40" />}
      <input
        data-key={row.key}
        value={row.title}
        disabled={isLobNone}
        onChange={(e) => setTitle(row.key, e.target.value)}
        onBlur={() => commit(row.key)}
        onKeyDown={onKeyDown}
        placeholder={row.kind === "lob" ? "Line of business…" : row.kind === "init" ? "Milestone…" : "Deliverable…"}
        className={`flex-1 min-w-0 bg-transparent outline-none placeholder:text-text-tertiary ${fontByKind} disabled:text-text-tertiary`}
      />
      {(row.endDate || (row.kind === "init" && row.startDate)) && (
        <span className="shrink-0 text-tiny tabular-nums text-text-tertiary">
          {row.kind === "init" && row.startDate ? `${fmtChip(row.startDate)} → ` : ""}
          {fmtChip(row.endDate) ?? ""}
        </span>
      )}
      {!isLobNone && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {(row.kind !== "task" || row.level < MAX_TASK_LEVEL) && (
            <button
              type="button"
              onClick={() => addChild(row)}
              title={row.kind === "lob" ? "Add milestone" : row.kind === "init" ? "Add deliverable" : "Add sub-deliverable"}
              className="text-text-tertiary hover:text-text-primary p-0.5"
            >
              <Plus size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={() => remove(row.key)}
            title="Delete"
            className="text-text-tertiary hover:text-[var(--red-mid)] p-0.5"
          >
            <X size={13} />
          </button>
        </div>
      )}
      {isLobNone && (
        <button
          type="button"
          onClick={() => addChild(row)}
          title="Add milestone"
          className="text-text-tertiary hover:text-text-primary p-0.5 opacity-0 group-hover:opacity-100"
        >
          <Plus size={13} />
        </button>
      )}
    </div>
  );
}
