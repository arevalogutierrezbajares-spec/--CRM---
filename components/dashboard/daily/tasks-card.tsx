"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ListChecks, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { DashBadge, type BadgeVariant } from "../shared/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MentionInput, type MentionSources, type PickedEntity } from "@/components/ui/mention-input";
import { CaptureChips, useCapturePicks } from "./capture-chips";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { captureItemAction } from "@/app/(app)/dashboard/item-actions";
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

export function TasksCard({ tasks, scope, sources }: TasksCardProps) {
  const router = useRouter();
  const drawer = useItemDrawer();
  const projects = useMemo(() => drawer?.projects ?? [], [drawer]);
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
                <span
                  aria-hidden
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    t.isOverdue ? "bg-[var(--red-text)]" : t.status === "blocked" ? "bg-[var(--amber-text)]" : "bg-[var(--blue-text)]"
                  }`}
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
                {t.ownerName ? (
                  <span
                    title={`Owner: ${t.ownerName}`}
                    className="inline-flex max-w-[112px] shrink-0 items-center gap-1 truncate rounded-full bg-surface px-1 py-0.5 text-tiny text-text-secondary sm:px-2"
                  >
                    <span aria-hidden className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[var(--blue-text)] text-[8px] font-semibold text-white">
                      {t.ownerName.trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="hidden truncate sm:inline">{t.ownerName.split(/\s+/)[0]}</span>
                  </span>
                ) : (
                  <span className="hidden shrink-0 rounded-full bg-surface px-2 py-0.5 text-tiny text-text-tertiary sm:inline">
                    Unassigned
                  </span>
                )}
                <DashBadge variant={badge.variant}>{badge.label}</DashBadge>
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
