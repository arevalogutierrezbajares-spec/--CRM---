"use client";

/**
 * Bulk-edit outline — a fast, keyboard-driven indented editor over the whole
 * roadmap hierarchy (LoB → milestone → deliverable → sub-deliverable).
 *   • type to rename (saves on blur / Enter)
 *   • Enter  → new sibling below (auto-focused)
 *   • Tab / Shift+Tab → indent / outdent (within a milestone's task tree)
 *   • the + buttons add a child; × deletes
 */

import { useEffect, useRef, useState, useTransition } from "react";
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
type Row = {
  kind: RowKind;
  id: string;
  title: string;
  level: number; // 0 lob · 1 milestone · 2 deliverable · 3+ sub
  lobId: string | null;
  initiativeId?: string;
  parentTaskId?: string | null;
  startDate?: string | null;
  endDate?: string | null; // targetEndDate (init) / dueDate (task)
};

const MAX_TASK_LEVEL = 3; // deliverable = 2, sub-deliverable = 3

function flatten(data: PlanDocData): Row[] {
  const rows: Row[] = [];
  const byLob = new Map<string | null, PlanDocInitiative[]>();
  for (const i of data.initiatives) {
    const k = i.lobId ?? null;
    const a = byLob.get(k) ?? [];
    a.push(i);
    byLob.set(k, a);
  }
  const walkTasks = (tasks: PlanDocTask[], initId: string, parent: string | null, level: number) => {
    for (const t of tasks) {
      rows.push({ kind: "task", id: t.id, title: t.title, level, lobId: null, initiativeId: initId, parentTaskId: parent, endDate: t.dueDate });
      if (t.children.length) walkTasks(t.children, initId, t.id, level + 1);
    }
  };
  const emitInits = (lobId: string | null) => {
    for (const init of byLob.get(lobId) ?? []) {
      rows.push({ kind: "init", id: init.id, title: init.title, level: 1, lobId, startDate: init.startDate, endDate: init.targetEndDate });
      walkTasks(init.tasks, init.id, null, 2);
    }
  };
  for (const lob of data.lobs) {
    rows.push({ kind: "lob", id: lob.id, title: lob.title, level: 0, lobId: lob.id });
    emitInits(lob.id);
  }
  if ((byLob.get(null) ?? []).length) {
    rows.push({ kind: "lob", id: "__none__", title: "Cross-venture (no line of business)", level: 0, lobId: null });
    emitInits(null);
  }
  return rows;
}

export function BulkEditOutline({ data }: { data: PlanDocData }) {
  const rows = flatten(data);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // After a structural change re-renders with fresh data, focus the new row.
  useEffect(() => {
    if (!focusId) return;
    const el = document.querySelector<HTMLInputElement>(`input[data-rowid="${focusId}"]`);
    if (el) {
      el.focus();
      el.select();
      setFocusId(null);
    }
  }, [focusId, rows]);

  return (
    <div
      className="rounded-lg border bg-card p-3"
      style={{ borderColor: "var(--border-default)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-tiny text-text-tertiary">
          Enter = new row · Tab / ⇧Tab = indent/outdent · type to rename · /END 5/4 (or /START) sets dates
        </p>
      </div>

      <div className="space-y-0.5">
        {rows.map((row, idx) => (
          <OutlineRow
            key={`${row.kind}-${row.id}`}
            row={row}
            prev={rows[idx - 1]}
            setFocusId={setFocusId}
            startTransition={startTransition}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            const r = await createLob();
            if (r.id) setFocusId(r.id);
          })
        }
        className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-text-primary"
      >
        <Plus size={14} /> Add line of business
      </button>
    </div>
  );
}

function OutlineRow({
  row,
  prev,
  setFocusId,
  startTransition,
}: {
  row: Row;
  prev: Row | undefined;
  setFocusId: (id: string | null) => void;
  startTransition: (cb: () => void) => void;
}) {
  const [title, setTitle] = useState(row.title);
  useEffect(() => setTitle(row.title), [row.title]);

  const isLobNone = row.id === "__none__";

  const commit = () => {
    const { title: parsedTitle, start, end } = parseDateTokens(title);
    const newTitle = parsedTitle || row.title; // never blank the title
    const titleChanged = newTitle !== row.title;
    const hasDates = start !== undefined || end !== undefined;
    if (!titleChanged && !hasDates) return;
    if (parsedTitle && parsedTitle !== title) setTitle(newTitle); // strip tokens from the field

    if (row.kind === "lob" && !isLobNone) {
      if (titleChanged) startTransition(() => renameLob(row.id, newTitle));
    } else if (row.kind === "init") {
      const patch: Parameters<typeof updateInitiativeFields>[1] = {};
      if (titleChanged) patch.title = newTitle;
      if (start !== undefined) patch.startDate = start;
      if (end !== undefined) patch.targetEndDate = end;
      startTransition(() => updateInitiativeFields(row.id, patch));
    } else if (row.kind === "task") {
      const patch: Parameters<typeof updateRoadmapTask>[1] = {};
      if (titleChanged) patch.title = newTitle;
      if (end !== undefined) patch.dueDate = end; // tasks carry a single due date
      startTransition(() => updateRoadmapTask(row.id, patch));
    }
  };

  const addSibling = () => {
    commit();
    startTransition(async () => {
      if (row.kind === "lob") {
        const r = await createLob();
        if (r.id) setFocusId(r.id);
      } else if (row.kind === "init") {
        const r = await createInitiative({ lobId: row.lobId });
        if (r.id) setFocusId(r.id);
      } else {
        const r = await createRoadmapTask({
          initiativeId: row.initiativeId!,
          title: "",
          parentTaskId: row.parentTaskId ?? null,
        });
        if (r.id) setFocusId(r.id);
      }
    });
  };

  const addChild = () => {
    startTransition(async () => {
      if (row.kind === "lob") {
        const r = await createInitiative({ lobId: row.lobId });
        if (r.id) setFocusId(r.id);
      } else if (row.kind === "init") {
        const r = await createRoadmapTask({ initiativeId: row.id, title: "", parentTaskId: null });
        if (r.id) setFocusId(r.id);
      } else if (row.level < MAX_TASK_LEVEL) {
        const r = await createRoadmapTask({
          initiativeId: row.initiativeId!,
          title: "",
          parentTaskId: row.id,
        });
        if (r.id) setFocusId(r.id);
      }
    });
  };

  const remove = () => {
    if (isLobNone) return;
    if (row.kind === "lob") {
      if (!confirm("Delete this line of business? Its milestones stay (become Cross-venture).")) return;
      startTransition(() => deleteLob(row.id));
    } else if (row.kind === "init") {
      if (!confirm("Delete this milestone and all its deliverables?")) return;
      startTransition(() => deleteInitiative(row.id));
    } else {
      startTransition(() => deleteRoadmapTask(row.id));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addSibling();
    } else if (e.key === "Tab" && row.kind === "task") {
      e.preventDefault();
      if (e.shiftKey) {
        // outdent: become a sibling of the current parent (one level up)
        if (row.parentTaskId) {
          commit();
          startTransition(async () => {
            // parent's parent = grandparent (null if parent is a top deliverable)
            await reparentRoadmapTask(row.id, null);
            setFocusId(row.id);
          });
        }
      } else {
        // indent: become a child of the previous sibling task (same level + parent)
        if (
          prev &&
          prev.kind === "task" &&
          prev.initiativeId === row.initiativeId &&
          (prev.parentTaskId ?? null) === (row.parentTaskId ?? null) &&
          row.level < MAX_TASK_LEVEL
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
        data-rowid={row.id}
        value={isLobNone ? row.title : title}
        disabled={isLobNone}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className={`flex-1 min-w-0 bg-transparent outline-none ${fontByKind} disabled:text-text-tertiary`}
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
              onClick={addChild}
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
            onClick={remove}
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
          onClick={addChild}
          title="Add milestone"
          className="text-text-tertiary hover:text-text-primary p-0.5 opacity-0 group-hover:opacity-100"
        >
          <Plus size={13} />
        </button>
      )}
    </div>
  );
}
