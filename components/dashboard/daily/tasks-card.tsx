"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ListChecks, Plus } from "lucide-react";
import { toast } from "sonner";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { DashBadge, type BadgeVariant } from "../shared/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createTaskAction } from "@/app/(app)/dashboard/item-actions";
import { useItemDrawer } from "../item-drawer";
import type { DashTask } from "@/db/queries/dashboard";

interface TasksCardProps {
  tasks: DashTask[];
  scope: "today" | "week" | "month";
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

export function TasksCard({ tasks, scope }: TasksCardProps) {
  const router = useRouter();
  const drawer = useItemDrawer();
  const projects = drawer?.projects ?? [];
  const [newTitle, setNewTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [adding, setAdding] = useState(false);

  async function quickAdd() {
    if (!newTitle.trim()) return;
    if (!projectId) {
      toast.error("Pick a project for the task.");
      return;
    }
    setAdding(true);
    const res = await createTaskAction({ title: newTitle, projectId });
    setAdding(false);
    if (res.ok) {
      setNewTitle("");
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
                <input type="checkbox" aria-label={`Complete ${t.title}`} className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-green-mid" disabled />
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
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void quickAdd();
              }
            }}
            placeholder="Add a task…"
            className="h-7 flex-1 border-0 bg-transparent px-0 text-[12.5px] focus-visible:ring-0"
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

      {tasks.length > 8 && <p className="mt-1 text-tiny text-text-tertiary">+{tasks.length - 8} more</p>}
    </DashCard>
  );
}
