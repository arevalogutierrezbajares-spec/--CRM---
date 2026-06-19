"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, ListChecks, Plus, Search, SlidersHorizontal, Trash2, UserPlus2, X } from "lucide-react";
import { toast } from "sonner";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { DashBadge, type BadgeVariant } from "../shared/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MentionInput, type MentionSources, type PickedEntity } from "@/components/ui/mention-input";
import type { MemberOption } from "@/components/town-hall/types";
import { CaptureChips, useCapturePicks } from "./capture-chips";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  captureItemAction,
  deleteTaskAction,
  extendTaskDueDateAction,
  updateTaskAction,
} from "@/app/(app)/dashboard/item-actions";
import { parseCapture } from "@/lib/nlp/parse-capture";
import { cn } from "@/lib/utils";
import { useItemDrawer } from "../item-drawer";
import type { DashTask } from "@/db/queries/dashboard";

interface TasksCardProps {
  tasks: DashTask[];
  scope: "today" | "week" | "month";
  /** Full @people/#project/@doc sources; falls back to drawer projects only. */
  sources?: MentionSources;
}

type StatusFilter = "all" | "open" | "blocked" | "overdue";
type SortMode = "due" | "project" | "owner";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "blocked", label: "Blocked" },
  { value: "overdue", label: "Overdue" },
];

function scopeLabel(scope: TasksCardProps["scope"]): string {
  return scope === "today" ? "Tasks today" : scope === "week" ? "Tasks this week" : "Tasks this month";
}

function bucketBadge(task: DashTask): { label: string; variant: BadgeVariant } {
  if (task.isOverdue) return { label: "Overdue", variant: "red" };
  if (task.status === "blocked") return { label: "Blocked", variant: "amber" };
  return { label: "Open", variant: "blue" };
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ownerKey(task: DashTask): string {
  return task.ownerUserId ?? task.ownerName ?? "unassigned";
}

function taskMatchesStatus(task: DashTask, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "overdue") return task.isOverdue;
  if (filter === "blocked") return task.status === "blocked";
  return !task.isOverdue && task.status !== "blocked";
}

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

const EXTEND_DAYS = [2, 5, 7] as const;

/**
 * Assign / reassign / clear a task's owner via an @-style picker. Renders the
 * owner as a clickable person bubble (or a "+ assign" affordance when empty);
 * clicking opens a searchable people list — pick to (re)assign, "Unassign" to
 * clear. (FR-E1-3)
 */
function AssigneeControl({
  task,
  people,
  onAssign,
}: {
  task: DashTask;
  people: MemberOption[];
  onAssign: (userId: string | null, displayName: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? people.filter((p) => p.displayName.toLowerCase().includes(t)) : people;
  }, [people, q]);

  const trigger = task.ownerName ? (
    <button
      type="button"
      title={`Owner: ${task.ownerName} — click to reassign`}
      className="inline-flex max-w-[120px] shrink-0 items-center gap-1 truncate rounded-full bg-surface px-1 py-0.5 text-tiny text-text-secondary transition-colors hover:bg-card sm:px-2"
    >
      <span aria-hidden className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[var(--blue-text)] text-[8px] font-semibold text-white">
        {initialOf(task.ownerName)}
      </span>
      <span className="hidden truncate sm:inline">{task.ownerName.split(/\s+/)[0]}</span>
    </button>
  ) : (
    <button
      type="button"
      title="Assign someone"
      aria-label="Assign task"
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-tiny text-text-tertiary transition-colors hover:bg-card hover:text-text-secondary"
    >
      <UserPlus2 size={12} /> <span className="hidden sm:inline">Assign</span>
    </button>
  );

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1.5">
        <div className="relative mb-1">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary">@</span>
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="assign…"
            className="h-[34px] pl-6 text-[12px]"
          />
        </div>
        <div className="max-h-56 overflow-auto">
          {task.ownerUserId && (
            <button
              type="button"
              onClick={() => { onAssign(null, null); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-text-tertiary hover:bg-surface"
            >
              <X size={13} /> Unassign
            </button>
          )}
          {filtered.length === 0 ? (
            <p className="px-2 py-2 text-tiny text-text-tertiary">No matches.</p>
          ) : (
            filtered.map((m) => {
              const active = m.userId === task.ownerUserId;
              return (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => { onAssign(m.userId, m.displayName); setOpen(false); }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] hover:bg-surface",
                    active ? "text-text-primary" : "text-text-secondary",
                  )}
                >
                  <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--blue-text)] text-[9px] font-semibold text-white">
                    {initialOf(m.displayName)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{m.displayName}</span>
                  {active && <CheckCircle2 size={13} className="shrink-0 text-[var(--blue-text)]" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Overdue badge that opens an "extend by N days" menu on click. (FR-E1-4) */
function OverdueExtendBadge({ onExtend }: { onExtend: (days: number) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Overdue — click to extend the due date"
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-tiny font-medium transition-colors"
          style={{ background: "var(--red-bg, rgba(139,32,32,0.12))", color: "var(--red-text)" }}
        >
          <CalendarClock size={11} /> Overdue
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>Extend due date</DropdownMenuLabel>
        {EXTEND_DAYS.map((d) => (
          <DropdownMenuItem key={d} onClick={() => onExtend(d)}>
            +{d} days
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TasksCard({ tasks: tasksProp, scope, sources }: TasksCardProps) {
  const router = useRouter();
  const drawer = useItemDrawer();
  const projects = useMemo(() => drawer?.projects ?? [], [drawer]);
  // Optimistic layer: rows removed (completed/deleted) and per-row field patches
  // (reassign / extend) applied over the server snapshot until the refresh lands.
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Map<string, Partial<DashTask>>>(new Map());
  // When the server snapshot changes (router.refresh after a mutation) it becomes
  // the truth — drop the optimistic layer so nothing stays stale-hidden or
  // double-patched. Reset DURING render on prop change (React's documented
  // "store info from previous render" pattern) rather than in an effect.
  const [prevTasksProp, setPrevTasksProp] = useState(tasksProp);
  if (prevTasksProp !== tasksProp) {
    setPrevTasksProp(tasksProp);
    setRemoved(new Set());
    setOverrides(new Map());
  }
  const tasks = useMemo(
    () =>
      tasksProp
        .map((t) => {
          const o = overrides.get(t.id);
          return o ? { ...t, ...o } : t;
        })
        .filter((t) => !removed.has(t.id)),
    [tasksProp, overrides, removed],
  );
  const [newTitle, setNewTitle] = useState("");
  const [quickProjectId, setQuickProjectId] = useState("");
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("due");
  const [pending, startTransition] = useTransition();
  const picks = useCapturePicks();
  const effectiveSources: MentionSources = useMemo(
    () =>
      sources ?? {
        people: [],
        projects: projects.map((p) => ({ refType: "project" as const, refId: p.id, label: p.title, href: `/projects/${p.id}` })),
        docs: [],
      },
    [sources, projects],
  );

  const projectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks) map.set(task.projectId, task.projectTitle);
    return Array.from(map.entries())
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [tasks]);

  const ownerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks) {
      if (task.ownerName) map.set(ownerKey(task), task.ownerName);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  const statusCounts = useMemo(
    () => ({
      all: tasks.length,
      open: tasks.filter((task) => taskMatchesStatus(task, "open")).length,
      blocked: tasks.filter((task) => taskMatchesStatus(task, "blocked")).length,
      overdue: tasks.filter((task) => taskMatchesStatus(task, "overdue")).length,
    }),
    [tasks],
  );

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter((task) => {
        if (projectFilter !== "all" && task.projectId !== projectFilter) return false;
        if (ownerFilter === "unassigned" && (task.ownerUserId || task.ownerName)) return false;
        if (ownerFilter !== "all" && ownerFilter !== "unassigned" && ownerKey(task) !== ownerFilter) return false;
        if (!taskMatchesStatus(task, statusFilter)) return false;
        if (!q) return true;
        return [task.title, task.projectTitle, task.ownerName ?? ""].some((value) => value.toLowerCase().includes(q));
      })
      .sort((a, b) => {
        if (sortMode === "project") {
          return a.projectTitle.localeCompare(b.projectTitle) || a.dueDate.localeCompare(b.dueDate);
        }
        if (sortMode === "owner") {
          return (a.ownerName ?? "Unassigned").localeCompare(b.ownerName ?? "Unassigned") || a.dueDate.localeCompare(b.dueDate);
        }
        return a.dueDate.localeCompare(b.dueDate);
      });
  }, [ownerFilter, projectFilter, query, sortMode, statusFilter, tasks]);

  const hasFilters = Boolean(
    query.trim() || projectFilter !== "all" || ownerFilter !== "all" || statusFilter !== "all" || sortMode !== "due",
  );
  const visibleTasks = filteredTasks.slice(0, 10);

  function clearFilters() {
    setQuery("");
    setProjectFilter("all");
    setOwnerFilter("all");
    setStatusFilter("all");
    setSortMode("due");
  }

  function onPick(e: PickedEntity) {
    // #project syncs the picker. People and docs go to the chip strip.
    if (e.kind === "ref" && e.ref.refType === "project") setQuickProjectId(e.ref.refId);
    else picks.onPick(e);
  }

  function quickAdd() {
    if (!newTitle.trim()) return;
    if (!quickProjectId) {
      toast.error("Pick a project for the task, or type #project.");
      return;
    }
    const raw = newTitle;
    const r = picks.reconcile(raw);
    if (r.notifyAll && !confirm("Notify the whole team about this?")) return;
    setNewTitle("");
    picks.reset();
    startTransition(async () => {
      const res = await captureItemAction({
        rawText: raw,
        itemKind: "task",
        projectId: quickProjectId,
        assigneeUserId: r.assigneeUserId,
        mentionUserIds: r.mentionUserIds,
        docRefs: r.docRefs,
        notifyAll: r.notifyAll,
        dueDate: parseCapture(raw).dueDate,
      });
      if (res.ok) {
        if (res.notified > 0) toast.success(res.summary, { duration: 1600 });
        router.refresh();
      } else toast.error(res.error);
    });
  }

  const clearOptimistic = (id: string) => {
    setRemoved((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    setOverrides((m) => {
      const n = new Map(m);
      n.delete(id);
      return n;
    });
  };
  const patchTask = (id: string, p: Partial<DashTask>) =>
    setOverrides((m) => new Map(m).set(id, { ...(m.get(id) ?? {}), ...p }));

  function completeTask(t: DashTask) {
    setRemoved((s) => new Set(s).add(t.id));
    startTransition(async () => {
      const res = await updateTaskAction({ id: t.id, status: "done" });
      if (res.ok) {
        toast.success("Done ✓", { duration: 1200 });
        router.refresh();
      } else {
        clearOptimistic(t.id);
        toast.error(res.error);
      }
    });
  }

  function removeTask(t: DashTask) {
    if (!confirm(`Delete "${t.title}"? This can't be undone.`)) return;
    setRemoved((s) => new Set(s).add(t.id));
    startTransition(async () => {
      const res = await deleteTaskAction({ id: t.id });
      if (res.ok) {
        toast.success("Deleted", { duration: 1200 });
        router.refresh();
      } else {
        clearOptimistic(t.id);
        toast.error(res.error);
      }
    });
  }

  function reassignTask(t: DashTask, userId: string | null, displayName: string | null) {
    patchTask(t.id, { ownerUserId: userId, ownerName: displayName });
    startTransition(async () => {
      const res = await updateTaskAction({ id: t.id, assigneeUserId: userId });
      if (res.ok) router.refresh();
      else {
        clearOptimistic(t.id);
        toast.error(res.error);
      }
    });
  }

  function extendTask(t: DashTask, days: number) {
    patchTask(t.id, { isOverdue: false });
    startTransition(async () => {
      const res = await extendTaskDueDateAction({ id: t.id, days });
      if (res.ok) {
        toast.success(`Extended +${days} days`, { duration: 1200 });
        router.refresh();
      } else {
        clearOptimistic(t.id);
        toast.error(res.error);
      }
    });
  }

  return (
    <DashCard>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel icon={ListChecks}>{scopeLabel(scope)}</SectionLabel>
        {tasks.length > 0 && (
          <span className="rounded-full bg-surface px-2 py-1 text-tiny text-text-tertiary">
            {filteredTasks.length} of {tasks.length}
          </span>
        )}
      </div>

      {tasks.length > 0 && (
        <div className="mt-2.5 space-y-2 rounded-lg bg-surface p-2">
          <div className="grid gap-2 xl:grid-cols-[minmax(180px,1fr)_minmax(132px,0.75fr)_minmax(128px,0.65fr)_104px]">
            <label className="relative block">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tasks"
                className="h-[40px] min-h-[40px] bg-card pl-8 text-[12px]"
              />
            </label>

            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="h-[40px] bg-card text-tiny">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projectOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="h-[40px] bg-card text-tiny">
                <SelectValue placeholder="Owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All owners</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {ownerOptions.map((owner) => (
                  <SelectItem key={owner.id} value={owner.id}>{owner.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
              <SelectTrigger className="h-[40px] bg-card text-tiny">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="due">Due first</SelectItem>
                <SelectItem value="project">Project</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex min-h-[32px] items-center gap-1 rounded-md px-1 text-tiny text-text-tertiary">
              <SlidersHorizontal size={12} /> Status
            </span>
            {STATUS_FILTERS.map((filter) => {
              const isSelected = statusFilter === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setStatusFilter(filter.value)}
                  className={cn(
                    "inline-flex min-h-[32px] items-center gap-1 rounded-md border px-2 text-tiny transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    isSelected ? "border-[var(--blue-text)] bg-card text-text-primary" : "border-transparent text-text-tertiary hover:bg-card hover:text-text-secondary",
                  )}
                >
                  {filter.label}
                  <span className="tabular-nums opacity-70">{statusCounts[filter.value]}</span>
                </button>
              );
            })}
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-md px-2 text-tiny text-text-tertiary transition-colors hover:bg-card hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <X size={12} /> Clear
              </button>
            )}
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-5 text-center">
          <CheckCircle2 size={20} className="text-green-mid" />
          <p className="text-[12px] text-text-secondary">Nothing due {scope === "today" ? "today" : `this ${scope}`}.</p>
        </div>
      ) : visibleTasks.length === 0 ? (
        <div className="mt-2 flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-3 text-center">
          <p className="text-[12px] text-text-secondary">No tasks match those filters.</p>
          <button type="button" onClick={clearFilters} className="text-tiny text-[var(--blue-text)] hover:underline">
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="mt-2 space-y-1">
          {visibleTasks.map((t) => {
            const badge = bucketBadge(t);
            return (
              <li key={t.id} className="group flex min-h-[50px] items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-surface">
                <Checkbox
                  checked={false}
                  onCheckedChange={() => completeTask(t)}
                  aria-label={`Mark "${t.title}" complete`}
                  title="Mark complete"
                  className="shrink-0"
                />
                {drawer ? (
                  <button
                    type="button"
                    onClick={() => drawer.openItem("milestone", t.id)}
                    className="flex min-w-0 flex-1 flex-col justify-center self-stretch rounded-sm text-left outline-none transition-transform active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    <div className="block truncate text-[12.5px] text-text-primary">{t.title}</div>
                    <div className="truncate text-tiny text-text-tertiary">{t.projectTitle} · {shortDate(t.dueDate)}</div>
                  </button>
                ) : (
                  <Link href={`/projects/${t.projectId}`} className="flex min-w-0 flex-1 flex-col justify-center self-stretch rounded-sm outline-none transition-transform active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                    <div className="block truncate text-[12.5px] text-text-primary hover:underline">{t.title}</div>
                    <div className="truncate text-tiny text-text-tertiary">{t.projectTitle} · {shortDate(t.dueDate)}</div>
                  </Link>
                )}
                <AssigneeControl
                  task={t}
                  people={effectiveSources.people}
                  onAssign={(userId, displayName) => reassignTask(t, userId, displayName)}
                />
                {t.isOverdue ? (
                  <OverdueExtendBadge onExtend={(days) => extendTask(t, days)} />
                ) : (
                  <DashBadge variant={badge.variant}>{badge.label}</DashBadge>
                )}
                <button
                  type="button"
                  onClick={() => removeTask(t)}
                  aria-label={`Delete "${t.title}"`}
                  title="Delete task"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-tertiary opacity-0 transition-opacity hover:bg-card hover:text-[var(--red-text)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {projects.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <Plus size={13} className="shrink-0 text-text-tertiary" />
          <MentionInput
            value={newTitle}
            onChange={setNewTitle}
            onPick={onPick}
            onSubmit={quickAdd}
            sources={effectiveSources}
            aria-label="Add a task"
            placeholder="Add a task... @assign  #project  @doc"
            className="min-w-[220px] flex-1"
            inputClassName="h-[40px] w-full border-0 bg-transparent px-0 text-[12.5px] outline-none placeholder:text-text-tertiary"
          />
          <Select value={quickProjectId} onValueChange={setQuickProjectId}>
            <SelectTrigger className="h-[40px] w-full text-tiny sm:w-36"><SelectValue placeholder="Project" /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {newTitle.trim() && (
            <Button type="button" size="sm" variant="ghost" onClick={quickAdd} loading={pending} className="h-[40px]">Add</Button>
          )}
        </div>
      )}
      {projects.length > 0 && <CaptureChips picks={picks} text={newTitle} />}

      {filteredTasks.length > visibleTasks.length && (
        <p className="mt-1 text-tiny text-text-tertiary">+{filteredTasks.length - visibleTasks.length} more matching tasks</p>
      )}
    </DashCard>
  );
}
