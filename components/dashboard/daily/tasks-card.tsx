"use client";

import { useMemo, useState } from "react";
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
  const [adding, setAdding] = useState(false);
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

  async function quickAdd() {
    if (adding || !newTitle.trim()) return;
    if (!projectId) {
      toast.error("Pick a project for the task (or type #project).");
      return;
    }
    setAdding(true);
    const r = picks.reconcile(newTitle);
    const res = await captureItemAction({
      rawText: newTitle,
      itemKind: "task",
      projectId,
      assigneeUserId: r.assigneeUserId,
      mentionUserIds: r.mentionUserIds,
      docRefs: r.docRefs,
    });
    setAdding(false);
    if (res.ok) {
      setNewTitle("");
      picks.reset();
      if (res.notified > 0) toast.success(res.summary, { duration: 1600 });
      router.refresh();
    } else {
      toast.error(res.error);
    }
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
        <ul className="space-y-1.5">
          {tasks.slice(0, 8).map((t) => {
            const badge = bucketBadge(t);
            return (
              <li key={t.id} className="flex items-start gap-2 group rounded px-1 py-1 hover:bg-surface transition-colors">
                {/* Status dot (decorative) — tasks are completed from the detail drawer, not here. */}
                <span
                  aria-hidden
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    t.isOverdue ? "bg-[var(--red-text)]" : t.status === "blocked" ? "bg-[var(--amber-text)]" : "bg-[var(--blue-text)]"
                  }`}
                />
                {drawer ? (
                  <button type="button" onClick={() => drawer.openItem("milestone", t.id)} className="min-w-0 flex-1 text-left">
                    <div className="block text-[12.5px] text-text-primary truncate">{t.title}</div>
                    <div className="text-tiny text-text-tertiary truncate">{t.projectTitle} · {shortDate(t.dueDate)}</div>
                  </button>
                ) : (
                  <Link href={`/projects/${t.projectId}`} className="min-w-0 flex-1">
                    <div className="block text-[12.5px] text-text-primary truncate hover:underline">{t.title}</div>
                    <div className="text-tiny text-text-tertiary truncate">{t.projectTitle} · {shortDate(t.dueDate)}</div>
                  </Link>
                )}
                <DashBadge variant={badge.variant}>{badge.label}</DashBadge>
              </li>
            );
          })}
        </ul>
      )}

      {projects.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          <Plus size={13} className="shrink-0 text-text-tertiary" />
          <MentionInput
            value={newTitle}
            onChange={setNewTitle}
            onPick={onPick}
            onSubmit={quickAdd}
            sources={effectiveSources}
            aria-label="Add a task"
            placeholder="Add a task… @assign  #project  @doc"
            className="flex-1"
            inputClassName="h-7 w-full border-0 bg-transparent px-0 text-[12.5px] outline-none placeholder:text-text-tertiary"
          />
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="h-7 w-28 text-tiny"><SelectValue placeholder="Project" /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {newTitle.trim() && (
            <Button type="button" size="sm" variant="ghost" onClick={quickAdd} loading={adding}>Add</Button>
          )}
        </div>
      )}
      {projects.length > 0 && <CaptureChips picks={picks} />}

      {tasks.length > 8 && <p className="mt-1 text-tiny text-text-tertiary">+{tasks.length - 8} more</p>}
    </DashCard>
  );
}
