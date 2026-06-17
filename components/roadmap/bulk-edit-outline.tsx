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
import { MentionInput } from "@/components/ui/mention-input";
import { PersonChipStack } from "@/components/roadmap/mention-bubbles";
import {
  createInitiative,
  createLob,
  createRoadmapTask,
  deleteInitiative,
  deleteLob,
  deleteRoadmapTask,
  duplicateRoadmapTasks,
  moveInitiative,
  moveRoadmapTask,
  renameLob,
  reorderLobs,
  reparentRoadmapTask,
  setRoadmapTaskProject,
  updateInitiativeFields,
  updateRoadmapTask,
} from "@/app/(app)/roadmap/actions";
import { Check, ClipboardPaste, Copy, Tag } from "lucide-react";

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
  project: string | null; // product-line tag (tasks only): caney | vav | all | null
  isLobNone: boolean;
};

/** Product-line tags. "all" = applies to both products (shows under every filter). */
const PROJECTS: Array<{ id: string; label: string; short: string; color: string }> = [
  { id: "caney", label: "CaneyCloud", short: "CC", color: "var(--blue-mid)" },
  { id: "vav", label: "VAV", short: "VAV", color: "var(--green-mid)" },
  { id: "all", label: "All (both)", short: "ALL", color: "var(--amber-mid)" },
];
const projectMeta = (id: string | null) => PROJECTS.find((p) => p.id === id) ?? null;

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
        lobKey: null, initKey, parentTaskKey, startDate: null, endDate: t.dueDate, project: t.project ?? null, isLobNone: false,
      });
      if (t.children.length) walkTasks(t.children, initKey, t.id, level + 1);
    }
  };
  const emitInits = (lobServerId: string | null, lobKey: string | null) => {
    for (const init of byLob.get(lobServerId) ?? []) {
      rows.push({
        key: init.id, serverId: init.id, kind: "init", title: init.title, level: 1,
        lobKey, initKey: null, parentTaskKey: null, startDate: init.startDate, endDate: init.targetEndDate, project: null, isLobNone: false,
      });
      walkTasks(init.tasks, init.id, null, 2);
    }
  };
  for (const lob of data.lobs) {
    rows.push({
      key: lob.id, serverId: lob.id, kind: "lob", title: lob.title, level: 0,
      lobKey: lob.id, initKey: null, parentTaskKey: null, startDate: null, endDate: null, project: null, isLobNone: false,
    });
    emitInits(lob.id, lob.id);
  }
  if ((byLob.get(null) ?? []).length) {
    rows.push({
      key: NONE_KEY, serverId: null, kind: "lob", title: "Cross-venture (no line of business)", level: 0,
      lobKey: null, initKey: null, parentTaskKey: null, startDate: null, endDate: null, project: null, isLobNone: true,
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
  // Multi-select (deliverables only) + copy/paste clipboard + project filter.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<string[]>([]); // server ids of copied roots
  const [projectFilter, setProjectFilter] = useState<"view-all" | "caney" | "vav">("view-all");
  const lastClicked = useRef<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const onPersonClick = useCallback(
    (userId: string) => router.push(`/roadmap?person=${userId}`),
    [router],
  );

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
    lobKey: null, initKey: null, parentTaskKey: null, startDate: null, endDate: null, project: null, isLobNone: false, ...over,
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

  // Blur of a never-typed new row → drop it (no "New deliverable"/"New milestone" clutter).
  const cleanupIfEmpty = (key: string) => {
    const cur = rowsRef.current;
    const i = cur.findIndex((r) => r.key === key);
    if (i < 0) return;
    const row = cur[i];
    if (row.isLobNone || !/^b\d+$/.test(key)) return; // only locally-created rows
    if (row.title.trim() !== "" || endOfSubtree(cur, key) > i + 1) return; // has text or children
    setRows((prev) => {
      const j = prev.findIndex((r) => r.key === key);
      if (j < 0) return prev;
      return [...prev.slice(0, j), ...prev.slice(endOfSubtree(prev, key))];
    });
    const del = (sid: string) => {
      if (row.kind === "lob") void deleteLob(sid, true).then(scheduleRefresh);
      else if (row.kind === "init") void deleteInitiative(sid, true).then(scheduleRefresh);
      else void deleteRoadmapTask(sid, true).then(scheduleRefresh);
    };
    if (row.serverId) del(row.serverId);
    else withServerId(key, (sid) => sid && del(sid));
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

  // ── Project filter (which rows are shown) ──
  const visibleKeys = useMemo(() => {
    if (projectFilter === "view-all") return null; // null = everything visible
    const show = new Set<string>();
    // Deliverables (level-2 tasks) + their subtrees, when the tag matches.
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.kind === "task" && r.level === 2 && (r.project === projectFilter || r.project === "all")) {
        const end = endOfSubtree(rows, r.key);
        for (let j = i; j < end; j++) show.add(rows[j].key);
      }
    }
    // Reveal ancestor milestones + LoBs that contain a shown deliverable.
    for (const r of rows) {
      if (r.kind === "init" && rows.some((t) => t.kind === "task" && t.initKey === r.key && show.has(t.key)))
        show.add(r.key);
    }
    for (const r of rows) {
      if (r.kind === "lob" && rows.some((i) => i.kind === "init" && i.lobKey === r.key && show.has(i.key)))
        show.add(r.key);
    }
    return show;
  }, [rows, projectFilter]);

  const filteredRows = useMemo(
    () => (visibleKeys ? rows.filter((r) => visibleKeys.has(r.key)) : rows),
    [rows, visibleKeys],
  );

  // ── Multi-select (deliverables only) ──
  const toggleSelect = (key: string, opts: { range?: boolean }) => {
    const tasks = (visibleKeys ? filteredRows : rowsRef.current).filter((r) => r.kind === "task");
    setSelected((prev) => {
      const next = new Set(prev);
      if (opts.range && lastClicked.current) {
        const a = tasks.findIndex((r) => r.key === lastClicked.current);
        const b = tasks.findIndex((r) => r.key === key);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(tasks[i].key);
        }
      } else {
        if (next.has(key)) next.delete(key);
        else next.add(key);
      }
      return next;
    });
    lastClicked.current = key;
  };
  const clearSelection = () => setSelected(new Set());

  // Top-level selected keys (drop descendants whose ancestor is also selected).
  const selectionRoots = useCallback((): ERow[] => {
    const cur = rowsRef.current;
    const sel = cur.filter((r) => selected.has(r.key));
    const isCoveredByAncestor = (row: ERow) => {
      let p = row.parentTaskKey;
      while (p) {
        if (selected.has(p)) return true;
        p = cur.find((r) => r.key === p)?.parentTaskKey ?? null;
      }
      return false;
    };
    return sel.filter((r) => !isCoveredByAncestor(r));
  }, [selected]);

  const copySelection = () => {
    const ids = selectionRoots()
      .map((r) => r.serverId)
      .filter((x): x is string => !!x);
    setClipboard(ids);
  };

  const pasteClipboard = () => {
    if (clipboard.length === 0) return;
    // Anchor: the last-selected task with a server id (paste as siblings after it).
    const anchorRow = [...selected]
      .map((k) => rowsRef.current.find((r) => r.key === k))
      .filter((r): r is ERow => !!r && r.kind === "task" && !!r.serverId)
      .pop();
    const anchorId = anchorRow?.serverId ?? rowsRef.current.find((r) => r.serverId && r.key === clipboard[0])?.serverId ?? null;
    // Fall back to the first copied root's own id so "copy then paste" duplicates in place.
    const anchor = anchorId ?? clipboard[clipboard.length - 1];
    wantReseed.current = true;
    void duplicateRoadmapTasks(clipboard, anchor, false).then(() => router.refresh());
  };

  const setProjectForSelection = (project: string | null) => {
    const ids = rowsRef.current
      .filter((r) => selected.has(r.key) && r.kind === "task" && r.serverId)
      .map((r) => r.serverId as string);
    if (ids.length === 0) return;
    const keys = new Set(rowsRef.current.filter((r) => selected.has(r.key)).map((r) => r.key));
    setRows((prev) => prev.map((r) => (keys.has(r.key) && r.kind === "task" ? { ...r, project } : r)));
    void setRoadmapTaskProject(ids, project, true).then(scheduleRefresh);
  };

  const setRowProject = (key: string, project: string | null) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, project } : r)));
    withServerId(key, (sid) => sid && void setRoadmapTaskProject([sid], project, true).then(scheduleRefresh));
  };

  const deleteSelection = () => {
    if (!confirm(`Delete ${selected.size} selected deliverable(s)?`)) return;
    selectionRoots().forEach((r) => remove(r.key));
    clearSelection();
  };

  // ── Drag and drop ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Render the filtered list; while dragging, hide the active node's
  // descendants (they travel with it).
  const displayRows = useMemo(() => {
    if (!activeKey) return filteredRows;
    const sub = subtreeKeySet(filteredRows, activeKey);
    sub.delete(activeKey);
    return filteredRows.filter((r) => !sub.has(r.key));
  }, [filteredRows, activeKey]);

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

  const filterChips: Array<{ id: "view-all" | "caney" | "vav"; label: string }> = [
    { id: "view-all", label: "All work" },
    { id: "caney", label: "CaneyCloud" },
    { id: "vav", label: "VAV" },
  ];

  return (
    <div className="rounded-lg border bg-card p-3" style={{ borderColor: "var(--border-default)" }}>
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <p className="text-tiny text-text-tertiary">
          Enter = new row · ↑↓ = move · Tab / ⇧Tab = indent · drag ⋮⋮ to move · ⌘/Ctrl-click to select · /END 5/4 sets dates
        </p>
        {/* Project filter */}
        <div className="flex items-center gap-1">
          <span className="text-tiny text-text-tertiary mr-0.5">Project:</span>
          {filterChips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setProjectFilter(c.id)}
              className="rounded-full border px-2 py-0.5 text-[11.5px] transition-colors"
              style={{
                borderColor: projectFilter === c.id ? "var(--blue-mid)" : "var(--border-default)",
                background: projectFilter === c.id ? "var(--blue-mid)" : "transparent",
                color: projectFilter === c.id ? "#fff" : "var(--text-secondary)",
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div
          className="flex items-center gap-2 flex-wrap rounded-md border px-2.5 py-1.5 mb-2 text-[12.5px]"
          style={{ borderColor: "var(--blue-mid)", background: "color-mix(in oklab, var(--blue-mid) 8%, transparent)" }}
        >
          <span className="font-medium text-text-primary">{selected.size} selected</span>
          <span className="h-4 w-px" style={{ background: "var(--border-default)" }} />
          <button type="button" onClick={copySelection} className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary">
            <Copy size={13} /> Copy
          </button>
          <button
            type="button"
            onClick={pasteClipboard}
            disabled={clipboard.length === 0}
            className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary disabled:opacity-40"
            title={clipboard.length ? `Paste ${clipboard.length} copied` : "Copy something first"}
          >
            <ClipboardPaste size={13} /> Paste{clipboard.length ? ` (${clipboard.length})` : ""}
          </button>
          <span className="h-4 w-px" style={{ background: "var(--border-default)" }} />
          <span className="inline-flex items-center gap-1 text-text-tertiary"><Tag size={12} /> Set project:</span>
          {PROJECTS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProjectForSelection(p.id)}
              className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-surface"
              style={{ borderColor: "var(--border-default)", color: p.color }}
            >
              {p.label}
            </button>
          ))}
          <button type="button" onClick={() => setProjectForSelection(null)} className="rounded border px-1.5 py-0.5 text-[11px] text-text-tertiary hover:bg-surface" style={{ borderColor: "var(--border-default)" }}>
            None
          </button>
          <span className="h-4 w-px" style={{ background: "var(--border-default)" }} />
          <button type="button" onClick={deleteSelection} className="text-[var(--red-mid)] hover:underline">Delete</button>
          <button type="button" onClick={clearSelection} className="text-text-tertiary hover:text-text-primary ml-auto">Clear</button>
        </div>
      )}

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
                members={data.members}
                onPersonClick={onPersonClick}
                projectedDepth={activeKey === row.key && projection ? projection.depth : null}
                dragValid={activeKey === row.key ? projection != null : null}
                isSelected={selected.has(row.key)}
                onSelectToggle={(range) => toggleSelect(row.key, { range })}
                setRowProject={setRowProject}
                setTitle={setTitle}
                commit={commit}
                onBlur={(k) => {
                  commit(k);
                  cleanupIfEmpty(k);
                }}
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
  members,
  onPersonClick,
  projectedDepth,
  dragValid,
  isSelected,
  onSelectToggle,
  setRowProject,
  setTitle,
  commit,
  onBlur,
  remove,
  addSibling,
  addChild,
  indent,
  outdent,
  moveFocus,
}: {
  row: ERow;
  members: PlanDocData["members"];
  onPersonClick: (userId: string) => void;
  projectedDepth: number | null;
  dragValid: boolean | null;
  isSelected: boolean;
  onSelectToggle: (range: boolean) => void;
  setRowProject: (key: string, project: string | null) => void;
  setTitle: (key: string, title: string) => void;
  commit: (key: string) => void;
  onBlur: (key: string) => void;
  remove: (key: string) => void;
  addSibling: (row: ERow) => void;
  addChild: (row: ERow) => void;
  indent: (key: string) => void;
  outdent: (key: string) => void;
  moveFocus: (fromKey: string, dir: 1 | -1) => void;
}) {
  const isLobNone = row.isLobNone;
  const mentionPeople = useMemo(
    () => members.map((m) => ({ userId: m.id, displayName: m.displayName })),
    [members],
  );
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.key,
    disabled: isLobNone,
  });

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
        background: isSelected ? "color-mix(in oklab, var(--blue-mid) 14%, transparent)" : undefined,
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
      {row.kind === "init" ? (
        <MentionInput
          value={row.title}
          onChange={(v) => setTitle(row.key, v)}
          onKeyDown={onKeyDown}
          onBlur={() => onBlur(row.key)}
          sources={{ people: mentionPeople, projects: [], docs: [] }}
          placeholder="Milestone… (type @ to tag people)"
          className="flex-1 min-w-0"
          inputClassName={`w-full bg-transparent outline-none placeholder:text-text-tertiary ${fontByKind}`}
          inputProps={{ "data-key": row.key }}
        />
      ) : (
        <input
          data-key={row.key}
          value={row.title}
          disabled={isLobNone}
          onMouseDown={(e) => {
            // ⌘/Ctrl-click (or ⇧-click) selects the deliverable instead of editing.
            if (row.kind === "task" && (e.metaKey || e.ctrlKey || e.shiftKey)) {
              e.preventDefault();
              onSelectToggle(e.shiftKey);
            }
          }}
          onChange={(e) => setTitle(row.key, e.target.value)}
          onBlur={() => onBlur(row.key)}
          onKeyDown={onKeyDown}
          placeholder={row.kind === "lob" ? "Line of business…" : "Deliverable…"}
          className={`flex-1 min-w-0 bg-transparent outline-none placeholder:text-text-tertiary ${fontByKind} disabled:text-text-tertiary`}
        />
      )}
      {row.kind === "task" && <ProjectChip value={row.project} onChange={(p) => setRowProject(row.key, p)} />}
      {row.kind === "init" && (
        <PersonChipStack text={row.title} members={mentionPeople} onPersonClick={onPersonClick} />
      )}
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

/** Compact product-line tag chip for a deliverable: shows the tag (color-coded)
 *  and opens a tiny menu (CaneyCloud / VAV / All / None). */
function ProjectChip({ value, onChange }: { value: string | null; onChange: (p: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const meta = projectMeta(value);
  return (
    <span className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={meta ? `Project: ${meta.label}` : "Tag a project"}
        className="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide tabular-nums transition-opacity"
        style={
          meta
            ? { borderColor: meta.color, color: meta.color, background: `color-mix(in oklab, ${meta.color} 12%, transparent)` }
            : { borderColor: "var(--border-default)", color: "var(--text-tertiary)" }
        }
      >
        {meta ? meta.short : "tag"}
      </button>
      {open && (
        <span
          className="absolute right-0 z-30 mt-1 flex flex-col rounded-md border bg-card py-1 shadow-xl"
          style={{ borderColor: "var(--border-default)", minWidth: 130 }}
        >
          {PROJECTS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange(p.id);
                setOpen(false);
              }}
              className="flex items-center gap-2 px-2.5 py-1 text-left text-[12px] hover:bg-surface"
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
              <span className="text-text-primary">{p.label}</span>
              {value === p.id && <Check size={12} className="ml-auto text-text-tertiary" />}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="flex items-center gap-2 px-2.5 py-1 text-left text-[12px] text-text-tertiary hover:bg-surface"
          >
            <span className="inline-block h-2 w-2 rounded-full border" style={{ borderColor: "var(--border-default)" }} />
            None
            {value == null && <Check size={12} className="ml-auto" />}
          </button>
        </span>
      )}
    </span>
  );
}
