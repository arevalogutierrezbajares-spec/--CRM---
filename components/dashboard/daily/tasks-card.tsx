"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ListChecks, Plus } from "lucide-react";
import { toast } from "sonner";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { DashBadge, type BadgeVariant } from "../shared/badge";
import { Button } from "@/components/ui/button";
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
import { useItemDrawer } from "../item-drawer";
import type { DashTask } from "@/db/queries/dashboard";

interface TasksCardProps {
  tasks: DashTask[];
  scope: "today" | "week" | "month";
  /** Full @people/#project/@doc sources; falls back to drawer projects only. */
  sources?: MentionSources;
}

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

export function TasksCard({ tasks, scope, sources }: TasksCardProps) {
  const router = useRouter();
  const drawer = useItemDrawer();
  const projects = useMemo(() => drawer?.projects ?? [], [drawer]);
  const [newTitle, setNewTitle] = useState("");
  const [projectId, setProjectId] = useState("");
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

  function onPick(e: PickedEntity) {
    // #project syncs the picker (the Select is the task's project source of
    // truth); people + docs go to the chip strip.
    if (e.kind === "ref" && e.ref.refType === "project") setProjectId(e.ref.refId);
    else picks.onPick(e);
  }

  function quickAdd() {
    if (!newTitle.trim()) return;
    if (!projectId) {
      toast.error("Pick a project for the task (or type #project).");
      return;
    }
    const raw = newTitle;
    const r = picks.reconcile(raw);
    if (r.notifyAll && !confirm("Notify the whole team about this?")) return;
    setNewTitle(""); // clear instantly
    picks.reset();
    startTransition(async () => {
      const res = await captureItemAction({
        rawText: raw,
        itemKind: "task",
        projectId,
        assigneeUserId: r.assigneeUserId,
        mentionUserIds: r.mentionUserIds,
        docRefs: r.docRefs,
        notifyAll: r.notifyAll,
        dueDate: parseCapture(raw).dueDate, // client-resolved (tz-correct)
      });
      if (res.ok) {
        if (res.notified > 0) toast.success(res.summary, { duration: 1600 });
        router.refresh(); // show the new task (no optimistic add — it may be out of scope)
      } else toast.error(res.error);
    });
  }

  return (
    <DashCard>
      <SectionLabel icon={ListChecks}>{scopeLabel(scope)}</SectionLabel>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-5 text-center">
          <CheckCircle2 size={20} className="text-green-mid" />
          <p className="text-[12px] text-text-secondary">Nothing due {scope === "today" ? "today" : `this ${scope}`}.</p>
        </div>
      ) : (
        <ul className="space-y-1">
          {tasks.slice(0, 8).map((t) => {
            const badge = bucketBadge(t);
            return (
              <li key={t.id} className="group flex min-h-[44px] items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-surface">
                {/* Status dot (decorative) — tasks are completed from the detail drawer, not here. */}
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
                    className="flex min-w-0 flex-1 flex-col justify-center self-stretch rounded-sm text-left outline-none transition-transform active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    <div className="block text-[12.5px] text-text-primary truncate">{t.title}</div>
                    <div className="text-tiny text-text-tertiary truncate">{t.projectTitle} · {shortDate(t.dueDate)}</div>
                  </button>
                ) : (
                  <Link href={`/projects/${t.projectId}`} className="flex min-w-0 flex-1 flex-col justify-center self-stretch rounded-sm outline-none transition-transform active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                    <div className="block text-[12.5px] text-text-primary truncate hover:underline">{t.title}</div>
                    <div className="text-tiny text-text-tertiary truncate">{t.projectTitle} · {shortDate(t.dueDate)}</div>
                  </Link>
                )}
                {t.ownerName && (
                  <span
                    title={`Owner: ${t.ownerName}`}
                    className="hidden max-w-[96px] shrink-0 items-center gap-1 truncate rounded-full bg-surface px-2 py-0.5 text-tiny text-text-secondary sm:inline-flex"
                  >
                    <span aria-hidden className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full bg-[var(--blue-text)] text-[8px] font-semibold text-white">
                      {t.ownerName.trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate">{t.ownerName.split(/\s+/)[0]}</span>
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
            placeholder="Add a task… @assign  #project  @doc"
            className="min-w-[220px] flex-1"
            inputClassName="h-[40px] w-full border-0 bg-transparent px-0 text-[12.5px] outline-none placeholder:text-text-tertiary"
          />
          <Select value={projectId} onValueChange={setProjectId}>
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

      {tasks.length > 8 && <p className="mt-1 text-tiny text-text-tertiary">+{tasks.length - 8} more</p>}
    </DashCard>
  );
}
