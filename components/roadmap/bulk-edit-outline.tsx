"use client";

/**
 * Bulk-edit outline — a fast, keyboard-driven indented editor over the whole
 * roadmap hierarchy (LoB → milestone → deliverable → sub-deliverable).
 *
 * Client-authoritative: local state owns the list so edits are instant and rows
 * never reorder/remount mid-write. Writes run "quiet" (no full /roadmap
 * revalidation); a single debounced router.refresh() syncs other surfaces.
 *
 *   • type to rename (saves on blur / Enter)
 *   • Enter      → new sibling below (auto-focused)
 *   • ↑ / ↓      → move between rows
 *   • Tab / ⇧Tab → indent / outdent (within a milestone's task tree)
 *   • the + buttons add a child; × (or ⌫ on an empty row) deletes
 *   • /END 5/4, /START, ETA:5/4 in the title set dates
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, X } from "lucide-react";
import type { PlanDocData, PlanDocInitiative, PlanDocTask } from "@/db/queries/roadmap";
import { fmtChip, parseDateTokens } from "@/lib/roadmap-dates";
import {
  createInitiative,
  createLob,
  createRoadmapTask,
  deleteInitiative,
  deleteLob,
  deleteRoadmapTask,
  renameLob,
  reparentRoadmapTask,
  updateInitiativeFields,
  updateRoadmapTask,
} from "@/app/(app)/roadmap/actions";

type RowKind = "lob" | "init" | "task";
type ERow = {
  key: string; // stable client id — never changes, so no remount on save
  serverId: string | null; // real db id (null until a create resolves)
  kind: RowKind;
  title: string;
  level: number; // 0 lob · 1 init · 2 deliverable · 3 sub
  lobKey: string | null; // containing LoB row key (null = cross-venture)
  initKey: string | null; // containing init row key (tasks only)
  parentTaskKey: string | null; // parent task row key (nested tasks)
  startDate: string | null;
  endDate: string | null; // targetEndDate (init) / dueDate (task)
  isLobNone: boolean; // the synthetic "Cross-venture" header
};

const MAX_TASK_LEVEL = 3; // deliverable = 2, sub-deliverable = 3
const NONE_KEY = "__none__";
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
  const walkTasks = (
    tasks: PlanDocTask[],
    initKey: string,
    parentTaskKey: string | null,
    level: number,
  ) => {
    for (const t of tasks) {
      rows.push({
        key: t.id,
        serverId: t.id,
        kind: "task",
        title: t.title,
        level,
        lobKey: null,
        initKey,
        parentTaskKey,
        startDate: null,
        endDate: t.dueDate,
        isLobNone: false,
      });
      if (t.children.length) walkTasks(t.children, initKey, t.id, level + 1);
    }
  };
  const emitInits = (lobServerId: string | null, lobKey: string | null) => {
    for (const init of byLob.get(lobServerId) ?? []) {
      rows.push({
        key: init.id,
        serverId: init.id,
        kind: "init",
        title: init.title,
        level: 1,
        lobKey,
        initKey: null,
        parentTaskKey: null,
        startDate: init.startDate,
        endDate: init.targetEndDate,
        isLobNone: false,
      });
      walkTasks(init.tasks, init.id, null, 2);
    }
  };
  for (const lob of data.lobs) {
    rows.push({
      key: lob.id,
      serverId: lob.id,
      kind: "lob",
      title: lob.title,
      level: 0,
      lobKey: lob.id,
      initKey: null,
      parentTaskKey: null,
      startDate: null,
      endDate: null,
      isLobNone: false,
    });
    emitInits(lob.id, lob.id);
  }
  if ((byLob.get(null) ?? []).length) {
    rows.push({
      key: NONE_KEY,
      serverId: null,
      kind: "lob",
      title: "Cross-venture (no line of business)",
      level: 0,
      lobKey: null,
      initKey: null,
      parentTaskKey: null,
      startDate: null,
      endDate: null,
      isLobNone: true,
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

export function BulkEditOutline({ data }: { data: PlanDocData }) {
  const [rows, setRows] = useState<ERow[]>(() => seed(data));
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  });

  // We do NOT re-seed from props on every change (that caused the reorder/churn).
  // For rare structural ops that the server reshapes differently than us (LoB
  // delete detaches its initiatives), we opt in to a one-shot re-seed.
  const wantReseed = useRef(false);
  useEffect(() => {
    if (wantReseed.current) {
      wantReseed.current = false;
      setRows(seed(data));
    }
  }, [data]);

  // Subscribers waiting on a row's server id (to create a child of a row whose
  // own create hasn't resolved yet).
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
  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  // Focus a freshly inserted row once it renders (stable key → fires on the
  // optimistic insert, no wait for the server).
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
    const i = inputs.findIndex((el) => el.dataset.key === fromKey);
    const next = inputs[i + dir];
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
    key: nk(),
    serverId: null,
    kind: "task",
    title: "",
    level: 0,
    lobKey: null,
    initKey: null,
    parentTaskKey: null,
    startDate: null,
    endDate: null,
    isLobNone: false,
    ...over,
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

  const addTask = (
    initKey: string,
    parentTaskKey: string | null,
    level: number,
    afterKey: string | null,
  ) => {
    const row = mkRow({ kind: "task", level, initKey, parentTaskKey });
    insertAfter(afterKey, row);
    setFocusKey(row.key);
    withServerId(initKey, (initSid) => {
      if (!initSid) return;
      withServerId(parentTaskKey, (parentSid) => {
        void createRoadmapTask({
          initiativeId: initSid,
          title: "",
          parentTaskId: parentSid,
          quiet: true,
        }).then((r) => {
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
              ...r,
              title: newTitle,
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
    if (row.kind === "lob" && !confirm("Delete this line of business? Its milestones move to Cross-venture."))
      return;
    if (row.kind === "init" && !confirm("Delete this milestone and all its deliverables?")) return;

    if (row.kind === "lob") {
      // Server keeps the initiatives (detaches them) → re-seed for correct shape.
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
      const end = endOfSubtree(prev, key);
      return [...prev.slice(0, i), ...prev.slice(end)];
    });
    if (row.serverId) {
      if (row.kind === "init") void deleteInitiative(row.serverId, true).then(scheduleRefresh);
      else void deleteRoadmapTask(row.serverId, true).then(scheduleRefresh);
    }
  };

  const subtreeKeys = (src: ERow[], key: string): Set<string> => {
    const i = src.findIndex((r) => r.key === key);
    if (i < 0) return new Set();
    return new Set(src.slice(i, endOfSubtree(src, key)).map((r) => r.key));
  };

  const indent = (key: string) => {
    const cur = rowsRef.current;
    const i = cur.findIndex((r) => r.key === key);
    const row = cur[i];
    if (!row || row.kind !== "task" || row.level >= MAX_TASK_LEVEL) return;
    // previous sibling = nearest earlier task with same init + parent + level
    let p = i - 1;
    while (
      p >= 0 &&
      !(
        cur[p].kind === "task" &&
        cur[p].initKey === row.initKey &&
        (cur[p].parentTaskKey ?? null) === (row.parentTaskKey ?? null) &&
        cur[p].level === row.level
      )
    ) {
      if (cur[p].level < row.level) return; // first child — nothing to indent under
      p--;
    }
    if (p < 0) return;
    const prevSib = cur[p];
    const sub = subtreeKeys(cur, key);
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
    const sub = subtreeKeys(cur, key);
    commit(key);
    setRows((prev) =>
      prev.map((r) => {
        if (r.key === key)
          return { ...r, level: Math.max(2, r.level - 1), parentTaskKey: grandparentKey };
        if (sub.has(r.key)) return { ...r, level: Math.max(2, r.level - 1) };
        return r;
      }),
    );
    setFocusKey(key);
    withServerId(key, (sid) => {
      if (!sid) return;
      withServerId(grandparentKey, (gsid) =>
        void reparentRoadmapTask(sid, gsid, true).then(scheduleRefresh),
      );
    });
  };

  // Enter → sibling of the same kind.
  const addSibling = (row: ERow) => {
    if (row.kind === "lob") addLob(row.isLobNone ? null : row.key);
    else if (row.kind === "init") addInit(row.lobKey, row.key);
    else addTask(row.initKey!, row.parentTaskKey ?? null, row.level, row.key);
  };

  // + button → child one level down.
  const addChild = (row: ERow) => {
    if (row.kind === "lob") addInit(row.isLobNone ? null : row.key, row.key);
    else if (row.kind === "init") addTask(row.key, null, 2, row.key);
    else if (row.level < MAX_TASK_LEVEL) addTask(row.initKey!, row.key, row.level + 1, row.key);
  };

  return (
    <div className="rounded-lg border bg-card p-3" style={{ borderColor: "var(--border-default)" }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-tiny text-text-tertiary">
          Enter = new row · ↑↓ = move · Tab / ⇧Tab = indent/outdent · type to rename · /END 5/4 sets dates
        </p>
      </div>

      <div className="space-y-0.5" ref={boxRef}>
        {rows.map((row) => (
          <OutlineRow
            key={row.key}
            row={row}
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

  return (
    <div
      className="group flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-surface"
      style={{ paddingLeft: `${row.level * 22 + 4}px` }}
    >
      {row.kind !== "lob" && (
        <ChevronRight size={12} className="text-text-tertiary shrink-0 opacity-40" />
      )}
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
      {/* add-child + delete on hover */}
      {!isLobNone && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {(row.kind !== "task" || row.level < MAX_TASK_LEVEL) && (
            <button
              type="button"
              onClick={() => addChild(row)}
              title={
                row.kind === "lob"
                  ? "Add milestone"
                  : row.kind === "init"
                    ? "Add deliverable"
                    : "Add sub-deliverable"
              }
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
