"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import type { PlanDocData, PlanDocInitiative, PlanDocTask } from "@/db/queries/roadmap";
import {
  createRoadmapTask,
  toggleRoadmapTask,
  updateInitiativeFields,
  updateRoadmapTask,
} from "@/app/(app)/roadmap/actions";

/** The plan as an editable document (FR-RVW-1): initiative sections with
 *  inline-editable metadata and a nested task checklist. Edits save in place
 *  (D5 — the md file is regenerated on export, never maintained). This is the
 *  ONLY surface where initiatives are edited (INV-7). No raw markdown editor
 *  exists (INV-3). */
export function PlanDoc({
  data,
  focusId,
}: {
  data: PlanDocData;
  focusId?: string | null;
}) {
  const initiatives = focusId
    ? data.initiatives.filter((i) => i.id === focusId)
    : data.initiatives;
  if (data.initiatives.length === 0) {
    return (
      <div
        className="rounded-lg border bg-card p-6 text-center space-y-2"
        style={{ borderColor: "var(--border-default)" }}
      >
        <p className="text-[13.5px] text-text-secondary">
          No initiatives yet. Start the plan two ways:
        </p>
        <p className="text-[13px] text-text-secondary">
          <Link href="/initiatives/new" className="underline">
            create an initiative
          </Link>{" "}
          · or{" "}
          <Link href="/roadmap/import" className="underline">
            paste a markdown plan
          </Link>
        </p>
      </div>
    );
  }
  // Group initiatives into Line-of-Business sections (LoB order first, then
  // any unassigned as "Cross-venture").
  const order = new Map(data.lobs.map((l, i) => [l.id, i]));
  const groups = new Map<
    string,
    { lobId: string | null; lobTitle: string; inits: PlanDocInitiative[] }
  >();
  for (const init of initiatives) {
    const key = init.lobId ?? "none";
    if (!groups.has(key)) {
      groups.set(key, {
        lobId: init.lobId ?? null,
        lobTitle: init.lobTitle ?? "Cross-venture",
        inits: [],
      });
    }
    groups.get(key)!.inits.push(init);
  }
  const groupList = Array.from(groups.values()).sort((a, b) => {
    const ai = a.lobId ? (order.get(a.lobId) ?? 999) : 1000;
    const bi = b.lobId ? (order.get(b.lobId) ?? 999) : 1000;
    return ai - bi;
  });

  return (
    <div className="space-y-5">
      {groupList.map((g) => (
        <LobGroup
          key={g.lobId ?? "none"}
          lobTitle={g.lobTitle}
          inits={g.inits}
          members={data.members}
          lobs={data.lobs}
        />
      ))}
      <Link
        href="/initiatives/new"
        className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-text-primary"
      >
        <Plus size={14} /> New initiative
      </Link>
    </div>
  );
}

/* ─── Line-of-Business group (swimlane) ───────────────────────────────── */

function LobGroup({
  lobTitle,
  inits,
  members,
  lobs,
}: {
  lobTitle: string;
  inits: PlanDocInitiative[];
  members: PlanDocData["members"];
  lobs: PlanDocData["lobs"];
}) {
  const [open, setOpen] = useState(true);
  const done = inits.reduce((n, i) => n + countDone(i.tasks).done, 0);
  const total = inits.reduce((n, i) => n + countDone(i.tasks).total, 0);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-left"
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="text-[13px] font-semibold uppercase tracking-wider text-text-secondary">
          {lobTitle}
        </span>
        <span className="text-tiny text-text-tertiary">
          · {inits.length} {inits.length === 1 ? "initiative" : "initiatives"}
          {total > 0 ? ` · ${done}/${total}` : ""}
        </span>
        <span
          className="flex-1 ml-2 border-t"
          style={{ borderColor: "var(--border-default)" }}
        />
      </button>
      {open && (
        <div className="space-y-3 pl-1">
          {inits.map((init) => (
            <InitiativeSection
              key={init.id}
              init={init}
              members={members}
              lobs={lobs}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Initiative section ──────────────────────────────────────────────── */

const HEALTH: Record<string, string> = {
  green: "var(--green-mid)",
  amber: "var(--amber-mid)",
  red: "var(--red-mid)",
};

function countDone(tasks: PlanDocTask[]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  const walk = (ts: PlanDocTask[]) => {
    for (const t of ts) {
      total++;
      if (t.done) done++;
      walk(t.children);
    }
  };
  walk(tasks);
  return { done, total };
}

function InitiativeSection({
  init,
  members,
  lobs,
}: {
  init: PlanDocInitiative;
  members: PlanDocData["members"];
  lobs: PlanDocData["lobs"];
}) {
  const [open, setOpen] = useState(true);
  const [, startTransition] = useTransition();
  const { done, total } = countDone(init.tasks);

  const save = (patch: Parameters<typeof updateInitiativeFields>[1]) =>
    startTransition(() => updateInitiativeFields(init.id, patch));

  return (
    <section
      className="rounded-lg border bg-card"
      style={{ borderColor: "var(--border-default)" }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-text-tertiary hover:text-text-primary shrink-0"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ background: HEALTH[init.healthColor] ?? "var(--green-mid)" }}
          title={`Health: ${init.healthColor} (click selector to change)`}
        />
        <EditableText
          value={init.title}
          className="text-[14.5px] font-medium flex-1 min-w-0"
          onSave={(title) => title && save({ title })}
        />
        <span className="text-[12px] text-text-tertiary tabular-nums shrink-0">
          {total > 0 ? `${done}/${total}` : "—"}
        </span>
        <Link
          href={`/initiatives/${init.id}`}
          className="text-[12px] text-text-tertiary hover:text-text-primary shrink-0"
        >
          open
        </Link>
      </div>

      {open && (
        <div
          className="border-t px-3 py-3 space-y-3"
          style={{ borderColor: "var(--border-default)" }}
        >
          {/* Metadata strip — every control writes straight to the DB */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px]">
            <label className="flex items-center gap-1.5 text-text-secondary">
              Status
              <select
                defaultValue={init.status}
                onChange={(e) =>
                  save({
                    status: e.target.value as
                      | "planning"
                      | "active"
                      | "paused"
                      | "done"
                      | "cancelled",
                  })
                }
                className="rounded border bg-card px-1 py-0.5"
                style={{ borderColor: "var(--border-default)" }}
              >
                {["planning", "active", "paused", "done", "cancelled"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-text-secondary">
              Health
              <select
                defaultValue={init.healthColor}
                onChange={(e) =>
                  save({ healthColor: e.target.value as "green" | "amber" | "red" })
                }
                className="rounded border bg-card px-1 py-0.5"
                style={{ borderColor: "var(--border-default)" }}
              >
                {["green", "amber", "red"].map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-text-secondary">
              Owner
              <select
                defaultValue={init.ownerUserId ?? ""}
                onChange={(e) => save({ ownerUserId: e.target.value || null })}
                className="rounded border bg-card px-1 py-0.5"
                style={{ borderColor: "var(--border-default)" }}
              >
                <option value="">—</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-text-secondary">
              LoB
              <select
                defaultValue={init.lobId ?? ""}
                onChange={(e) => save({ lobId: e.target.value || null })}
                className="rounded border bg-card px-1 py-0.5"
                style={{ borderColor: "var(--border-default)" }}
              >
                <option value="">Cross-venture</option>
                {lobs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-text-secondary">
              Dates
              <input
                type="date"
                defaultValue={init.startDate ?? ""}
                onChange={(e) => save({ startDate: e.target.value || null })}
                className="rounded border bg-card px-1 py-0.5"
                style={{ borderColor: "var(--border-default)" }}
              />
              →
              <input
                type="date"
                defaultValue={init.targetEndDate ?? ""}
                onChange={(e) => save({ targetEndDate: e.target.value || null })}
                className="rounded border bg-card px-1 py-0.5"
                style={{ borderColor: "var(--border-default)" }}
              />
            </label>
          </div>

          {/* Goal + success criteria as document lines */}
          <div className="space-y-1">
            <DocLine
              label="Goal"
              value={init.goal}
              placeholder="one-line why"
              onSave={(v) => save({ goal: v || null })}
            />
            <DocLine
              label="Success"
              value={init.successCriteria}
              placeholder="how you'll know it worked"
              onSave={(v) => save({ successCriteria: v || null })}
            />
            {init.successOutcome && (
              <p className="text-[12.5px] text-text-tertiary">
                Outcome: <span className="font-medium">{init.successOutcome}</span>
              </p>
            )}
          </div>

          {/* Task checklist */}
          <TaskList initiativeId={init.id} tasks={init.tasks} depth={0} />
        </div>
      )}
    </section>
  );
}

/* ─── Task list (nested checklist — deliverables are parents, INV-4) ──── */

function TaskList({
  initiativeId,
  tasks,
  depth,
  parentTaskId = null,
}: {
  initiativeId: string;
  tasks: PlanDocTask[];
  depth: number;
  parentTaskId?: string | null;
}) {
  return (
    <ul className={depth === 0 ? "space-y-0.5" : "space-y-0.5 ml-6"}>
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} initiativeId={initiativeId} depth={depth} />
      ))}
      {depth === 0 && (
        <li>
          <AddTaskInput initiativeId={initiativeId} parentTaskId={parentTaskId} />
        </li>
      )}
    </ul>
  );
}

function TaskRow({
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
        <EditableText
          value={task.title}
          className={`text-[13px] flex-1 min-w-0 ${checked ? "line-through text-text-tertiary" : ""}`}
          onSave={(title) =>
            title && startTransition(() => updateRoadmapTask(task.id, { title }))
          }
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
      {(task.children.length > 0 || depth === 0) && task.children.length > 0 && (
        <TaskList
          initiativeId={initiativeId}
          tasks={task.children}
          depth={depth + 1}
          parentTaskId={task.id}
        />
      )}
    </li>
  );
}

function AddTaskInput({
  initiativeId,
  parentTaskId,
}: {
  initiativeId: string;
  parentTaskId: string | null;
}) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const submit = () => {
    const title = value.trim();
    if (!title) return;
    setValue("");
    startTransition(() => createRoadmapTask({ initiativeId, title, parentTaskId }).then(() => undefined));
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
        placeholder="Add task…"
        className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-text-tertiary"
      />
    </div>
  );
}

/* ─── Inline text editing primitive ───────────────────────────────────── */

function EditableText({
  value,
  onSave,
  className = "",
  placeholder,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className={`truncate text-left hover:opacity-80 ${className}`}
        title="Click to edit"
      >
        {value || placeholder || "—"}
      </button>
    );
  }
  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (v && v !== value) onSave(v);
  };
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      className={`bg-transparent border-b outline-none ${className}`}
      style={{ borderColor: "var(--border-default)" }}
    />
  );
}

/* ─── Document line (Goal / Success) ──────────────────────────────────── */

function DocLine({
  label,
  value,
  placeholder,
  onSave,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  onSave: (v: string) => void;
}) {
  return (
    <div className="flex items-baseline gap-2 text-[12.5px]">
      <span className="text-text-tertiary w-14 shrink-0">{label}</span>
      <EditableText
        value={value ?? ""}
        placeholder={placeholder}
        className={`flex-1 min-w-0 ${value ? "text-text-primary" : "text-text-tertiary italic"}`}
        onSave={onSave}
      />
    </div>
  );
}
