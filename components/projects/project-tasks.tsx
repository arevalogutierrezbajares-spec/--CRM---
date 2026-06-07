"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  Columns3,
  GripVertical,
  Plus,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addProjectTask,
  moveTaskBucket,
  removeMilestone,
  updateProjectTask,
} from "@/app/(app)/projects/actions";
import { formatDate } from "@/lib/utils";

export type TaskStatus =
  | "pending"
  | "in_progress"
  | "in_review"
  | "blocked"
  | "done"
  | "cancelled";
export type TaskPriority = "now" | "next" | "later" | "backlog";

export type ProjectTask = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueDate: string | null;
  priority: TaskPriority | null;
  assignedTo: string | null;
};

export type TaskMember = { userId: string; displayName: string };

type BucketKey = "pending" | "started" | "completed";

const BUCKETS: { key: BucketKey; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "started", label: "Started" },
  { key: "completed", label: "Completed" },
];

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "in_review", label: "In review" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "now", label: "Now" },
  { value: "next", label: "Next" },
  { value: "later", label: "Later" },
  { value: "backlog", label: "Backlog" },
];

const STATUS_VARIANT: Record<
  TaskStatus,
  "secondary" | "success" | "warning" | "danger" | "outline"
> = {
  pending: "secondary",
  in_progress: "outline",
  in_review: "outline",
  blocked: "warning",
  done: "success",
  cancelled: "secondary",
};

const PRIORITY_VARIANT: Record<TaskPriority, "danger" | "warning" | "secondary"> = {
  now: "danger",
  next: "warning",
  later: "secondary",
  backlog: "secondary",
};

const selectClass =
  "h-8 rounded-md border border-[var(--border)] bg-[var(--bg-card,var(--background))] px-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-[var(--blue-text,var(--ring))]";

function bucketOf(status: TaskStatus): BucketKey | null {
  if (status === "done") return "completed";
  if (status === "pending") return "pending";
  if (status === "cancelled") return null;
  return "started"; // in_progress | in_review | blocked
}

const BUCKET_STATUS: Record<BucketKey, TaskStatus> = {
  pending: "pending",
  started: "in_progress",
  completed: "done",
};

function isOverdue(t: ProjectTask): boolean {
  return Boolean(
    t.dueDate &&
      t.status !== "done" &&
      t.status !== "cancelled" &&
      new Date(t.dueDate) < new Date(new Date().toISOString().slice(0, 10)),
  );
}

export function ProjectTasks({
  projectId,
  tasks,
  members,
}: {
  projectId: string;
  tasks: ProjectTask[];
  members: TaskMember[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<ProjectTask[]>(tasks);
  const [view, setView] = useState<"board" | "table">("board");
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const memberName = (id: string | null) =>
    id ? members.find((m) => m.userId === id)?.displayName ?? "Unknown" : null;

  function resync(message?: string) {
    if (message) toast.error(message);
    router.refresh();
  }

  function patchLocal(id: string, patch: Partial<ProjectTask>) {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function moveToBucket(id: string, bucket: BucketKey) {
    const prev = items.find((t) => t.id === id);
    if (!prev || bucketOf(prev.status) === bucket) return;
    patchLocal(id, { status: BUCKET_STATUS[bucket] });
    startTransition(async () => {
      const res = await moveTaskBucket({ taskId: id, projectId, bucket });
      if (!res.ok) {
        patchLocal(id, { status: prev.status });
        resync(res.error);
      }
    });
  }

  function updateField(id: string, patch: Partial<ProjectTask>) {
    const prev = items.find((t) => t.id === id);
    if (!prev) return;
    patchLocal(id, patch);
    startTransition(async () => {
      const res = await updateProjectTask({ taskId: id, projectId, ...patch });
      if (!res.ok) {
        patchLocal(id, prev);
        resync(res.error);
      }
    });
  }

  function deleteTask(id: string) {
    const prev = items;
    setItems((p) => p.filter((t) => t.id !== id));
    startTransition(async () => {
      const res = await removeMilestone({ milestoneId: id, projectId });
      if (res.ok) toast.success("Task deleted");
      else {
        setItems(prev);
        resync(res.error);
      }
    });
  }

  async function addTask(input: Omit<ProjectTask, "id">) {
    setBusy(true);
    const res = await addProjectTask({ projectId, ...input });
    setBusy(false);
    if (res.ok && res.id) {
      setItems((prev) => [...prev, { id: res.id!, ...input }]);
      toast.success("Task added");
      return true;
    }
    toast.error(res.ok ? "Could not add task" : res.error);
    return false;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-md border border-[var(--border)] p-0.5">
          <ViewTab
            active={view === "board"}
            onClick={() => setView("board")}
            icon={<Columns3 className="h-3.5 w-3.5" />}
            label="Board"
          />
          <ViewTab
            active={view === "table"}
            onClick={() => setView("table")}
            icon={<Table2 className="h-3.5 w-3.5" />}
            label="Table"
          />
        </div>
        <span className="text-tiny text-text-tertiary tabular-nums">
          {items.length} {items.length === 1 ? "task" : "tasks"}
        </span>
      </div>

      <AddTaskForm members={members} busy={busy} onAdd={addTask} />

      {view === "board" ? (
        <BoardView
          items={items}
          memberName={memberName}
          onMove={moveToBucket}
        />
      ) : (
        <TableView
          items={items}
          members={members}
          onUpdate={updateField}
          onDelete={deleteTask}
        />
      )}
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-[var(--surface,var(--secondary))] text-text-primary"
          : "text-text-tertiary hover:text-text-primary"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/* ── Add task ─────────────────────────────────────────────────────────── */

function AddTaskForm({
  members,
  busy,
  onAdd,
}: {
  members: TaskMember[];
  busy: boolean;
  onAdd: (input: Omit<ProjectTask, "id">) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority | "">("");
  const [assignedTo, setAssignedTo] = useState("");
  const [status, setStatus] = useState<TaskStatus>("pending");

  function reset() {
    setTitle("");
    setDescription("");
    setDueDate("");
    setPriority("");
    setAssignedTo("");
    setStatus("pending");
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4" /> Add task
      </Button>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        const ok = await onAdd({
          title: title.trim(),
          description: description.trim() || null,
          dueDate: dueDate || null,
          priority: priority || null,
          assignedTo: assignedTo || null,
          status,
        });
        if (ok) {
          reset();
          setOpen(false);
        }
      }}
      className="space-y-2 rounded-md border border-[var(--border)] bg-card p-3"
    >
      <div className="flex items-center justify-between">
        <Label htmlFor="new-task-title">New task</Label>
        <button
          type="button"
          aria-label="Cancel"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-text-tertiary hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <Input
        id="new-task-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title"
        autoFocus
      />
      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="h-8 w-auto"
          aria-label="Due date"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority | "")}
          className={selectClass}
          aria-label="Priority"
        >
          <option value="">No priority</option>
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
          className={selectClass}
          aria-label="Assignee"
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as TaskStatus)}
          className={selectClass}
          aria-label="Status"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={busy || !title.trim()}>
          Add
        </Button>
      </div>
    </form>
  );
}

/* ── Board view (drag & drop) ─────────────────────────────────────────── */

function BoardView({
  items,
  memberName,
  onMove,
}: {
  items: ProjectTask[];
  memberName: (id: string | null) => string | null;
  onMove: (id: string, bucket: BucketKey) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const byBucket: Record<BucketKey, ProjectTask[]> = {
    pending: [],
    started: [],
    completed: [],
  };
  for (const t of items) {
    const b = bucketOf(t.status);
    if (b) byBucket[b].push(t);
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const overId = String(over.id);
    // over may be a column id or a card id — resolve to a bucket either way.
    let target: BucketKey | null = (["pending", "started", "completed"] as BucketKey[]).includes(
      overId as BucketKey,
    )
      ? (overId as BucketKey)
      : null;
    if (!target) {
      const overTask = items.find((t) => t.id === overId);
      if (overTask) target = bucketOf(overTask.status);
    }
    if (target) onMove(String(active.id), target);
  }

  const activeTask = activeId
    ? items.find((t) => t.id === activeId) ?? null
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {BUCKETS.map((b) => (
          <BucketColumn
            key={b.key}
            bucket={b.key}
            label={b.label}
            tasks={byBucket[b.key]}
            memberName={memberName}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <TaskCard task={activeTask} memberName={memberName} overlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function BucketColumn({
  bucket,
  label,
  tasks,
  memberName,
}: {
  bucket: BucketKey;
  label: string;
  tasks: ProjectTask[];
  memberName: (id: string | null) => string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: bucket });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[120px] flex-col gap-2 rounded-lg border p-2 transition-colors ${
        isOver
          ? "border-[var(--blue-text,var(--ring))] bg-[var(--surface,var(--secondary))]/40"
          : "border-[var(--border)] bg-[var(--surface,var(--secondary))]/20"
      }`}
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          {label}
        </span>
        <span className="text-tiny text-text-tertiary tabular-nums">
          {tasks.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {tasks.length === 0 && (
          <p className="px-1 py-4 text-center text-tiny text-text-tertiary">
            Drop tasks here
          </p>
        )}
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} memberName={memberName} />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({
  task,
  memberName,
}: {
  task: ProjectTask;
  memberName: (id: string | null) => string | null;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
  });
  return (
    <div
      ref={setNodeRef}
      className={isDragging ? "opacity-40" : ""}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} memberName={memberName} />
    </div>
  );
}

function TaskCard({
  task,
  memberName,
  overlay = false,
}: {
  task: ProjectTask;
  memberName: (id: string | null) => string | null;
  overlay?: boolean;
}) {
  const assignee = memberName(task.assignedTo);
  const overdue = isOverdue(task);
  return (
    <div
      className={`cursor-grab rounded-md border border-[var(--border)] bg-card p-2.5 active:cursor-grabbing ${
        overlay ? "shadow-lg" : "hover:border-[var(--ring)]"
      }`}
    >
      <div className="flex items-start gap-1.5">
        <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-tertiary" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-text-primary">
            {task.title}
          </p>
          {task.description && (
            <p className="mt-0.5 line-clamp-2 text-tiny text-text-tertiary">
              {task.description}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {(task.status === "blocked" || task.status === "in_review") && (
              <Badge variant={STATUS_VARIANT[task.status]}>
                {task.status === "in_review" ? "in review" : task.status}
              </Badge>
            )}
            {task.priority && (
              <Badge variant={PRIORITY_VARIANT[task.priority]}>
                {task.priority}
              </Badge>
            )}
            {task.dueDate && (
              <span
                className={`text-tiny ${
                  overdue ? "text-[var(--health-red)]" : "text-text-tertiary"
                }`}
              >
                due {formatDate(task.dueDate)}
              </span>
            )}
            {assignee && (
              <span className="text-tiny text-text-tertiary">· {assignee}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Table view ───────────────────────────────────────────────────────── */

function TableView({
  items,
  members,
  onUpdate,
  onDelete,
}: {
  items: ProjectTask[];
  members: TaskMember[];
  onUpdate: (id: string, patch: Partial<ProjectTask>) => void;
  onDelete: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-md border border-[var(--border)] px-4 py-6 text-center text-sm text-text-tertiary">
        No tasks yet. Add one above.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-[var(--border)]">
      <table className="w-full min-w-[760px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-[var(--border)] text-tiny uppercase tracking-wide text-text-tertiary">
            <th className="px-3 py-2 font-medium">Task</th>
            <th className="px-3 py-2 font-medium">Description</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Due</th>
            <th className="px-3 py-2 font-medium">Priority</th>
            <th className="px-3 py-2 font-medium">Assignee</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <TableRow
              key={t.id}
              task={t}
              members={members}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableRow({
  task,
  members,
  onUpdate,
  onDelete,
}: {
  task: ProjectTask;
  members: TaskMember[];
  onUpdate: (id: string, patch: Partial<ProjectTask>) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const overdue = isOverdue(task);

  return (
    <tr className="border-b border-[var(--border)] last:border-0 align-top">
      <td className="px-3 py-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            const v = title.trim();
            if (v && v !== task.title) onUpdate(task.id, { title: v });
            else setTitle(task.title);
          }}
          className="w-full min-w-[140px] rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] font-medium text-text-primary hover:border-[var(--border)] focus:border-[var(--ring)] focus:outline-none"
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => {
            const v = description.trim();
            if (v !== (task.description ?? ""))
              onUpdate(task.id, { description: v || null });
          }}
          placeholder="—"
          className="w-full min-w-[160px] rounded border border-transparent bg-transparent px-1 py-0.5 text-tiny text-text-secondary hover:border-[var(--border)] focus:border-[var(--ring)] focus:outline-none"
        />
      </td>
      <td className="px-3 py-2">
        <select
          value={task.status}
          onChange={(e) =>
            onUpdate(task.id, { status: e.target.value as TaskStatus })
          }
          className={selectClass}
          aria-label={`Status for ${task.title}`}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          type="date"
          value={task.dueDate ?? ""}
          onChange={(e) =>
            onUpdate(task.id, { dueDate: e.target.value || null })
          }
          className={`${selectClass} ${overdue ? "text-[var(--health-red)]" : ""}`}
          aria-label={`Due date for ${task.title}`}
        />
      </td>
      <td className="px-3 py-2">
        <select
          value={task.priority ?? ""}
          onChange={(e) =>
            onUpdate(task.id, {
              priority: (e.target.value || null) as TaskPriority | null,
            })
          }
          className={selectClass}
          aria-label={`Priority for ${task.title}`}
        >
          <option value="">—</option>
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <select
          value={task.assignedTo ?? ""}
          onChange={(e) =>
            onUpdate(task.id, { assignedTo: e.target.value || null })
          }
          className={selectClass}
          aria-label={`Assignee for ${task.title}`}
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Delete task ${task.title}`}
          onClick={() => {
            if (
              window.confirm(`Delete "${task.title}"? This cannot be undone.`)
            )
              onDelete(task.id);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}
