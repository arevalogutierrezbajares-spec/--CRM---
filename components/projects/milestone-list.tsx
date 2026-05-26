"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  toggleMilestone,
  blockMilestone,
  removeMilestone,
  addMilestone,
} from "@/app/(app)/projects/actions";
import { formatDate } from "@/lib/utils";

type Milestone = {
  id: string;
  title: string;
  status: "pending" | "done" | "blocked";
  dueDate: string | null;
  blockerText: string | null;
  order: number;
};

const statusVariant: Record<Milestone["status"], "secondary" | "success" | "warning"> = {
  pending: "secondary",
  done: "success",
  blocked: "warning",
};

export function MilestoneList({
  projectId,
  milestones,
}: {
  projectId: string;
  milestones: Milestone[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [blockerEditId, setBlockerEditId] = useState<string | null>(null);
  const [blockerText, setBlockerText] = useState("");

  function refresh() {
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
        {milestones.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-[var(--muted-foreground)]">
            No milestones yet.
          </li>
        )}
        {milestones.map((m) => {
          const isOverdue =
            m.dueDate &&
            m.status !== "done" &&
            new Date(m.dueDate) < new Date(new Date().toISOString().slice(0, 10));
          return (
            <li key={m.id} className="flex items-start gap-3 px-4 py-3">
              <Checkbox
                checked={m.status === "done"}
                disabled={pending}
                aria-label={`Mark "${m.title}" ${m.status === "done" ? "incomplete" : "done"}`}
                onCheckedChange={(v) => {
                  startTransition(async () => {
                    const res = await toggleMilestone({
                      milestoneId: m.id,
                      projectId,
                      done: Boolean(v),
                    });
                    if (res.ok) {
                      toast.success(
                        Boolean(v) ? "Marked done" : "Marked incomplete",
                      );
                    } else toast.error(res.error);
                    refresh();
                  });
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={
                      m.status === "done"
                        ? "text-[var(--muted-foreground)] line-through"
                        : "font-medium"
                    }
                  >
                    {m.title}
                  </span>
                  <Badge variant={statusVariant[m.status]}>{m.status}</Badge>
                  {m.dueDate && (
                    <span
                      className={
                        isOverdue
                          ? "text-xs text-[var(--health-red)]"
                          : "text-xs text-[var(--muted-foreground)]"
                      }
                    >
                      due {formatDate(m.dueDate)}
                    </span>
                  )}
                </div>
                {m.status === "blocked" && m.blockerText && (
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    blocker: {m.blockerText}
                  </p>
                )}
                {blockerEditId === m.id && (
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={blockerText}
                      onChange={(e) => setBlockerText(e.target.value)}
                      placeholder="What's blocking?"
                      className="h-8"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        startTransition(async () => {
                          const res = await blockMilestone({
                            milestoneId: m.id,
                            projectId,
                            blockerText,
                          });
                          if (res.ok) toast.success("Marked blocked");
                          else toast.error(res.error);
                          setBlockerEditId(null);
                          setBlockerText("");
                          refresh();
                        });
                      }}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setBlockerEditId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                {m.status !== "blocked" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setBlockerEditId(m.id);
                      setBlockerText(m.blockerText ?? "");
                    }}
                  >
                    Block
                  </Button>
                )}
                <ConfirmDialog
                  title="Delete milestone?"
                  description={
                    <>
                      Permanently removes <strong>{m.title}</strong>. Touches
                      created from this milestone are not deleted.
                    </>
                  }
                  confirmLabel="Delete"
                  destructive
                  onConfirm={async () => {
                    const res = await removeMilestone({
                      milestoneId: m.id,
                      projectId,
                    });
                    if (res.ok) {
                      toast.success("Milestone deleted");
                      refresh();
                    } else {
                      toast.error(res.error);
                    }
                  }}
                  trigger={(open) => (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete milestone ${m.title}`}
                      onClick={open}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!newTitle.trim()) return;
          startTransition(async () => {
            const res = await addMilestone({
              projectId,
              title: newTitle,
              dueDate: newDate || null,
            });
            if (res.ok) toast.success("Milestone added");
            else toast.error(res.error);
            setNewTitle("");
            setNewDate("");
            refresh();
          });
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <div className="flex-1 space-y-1">
          <Label htmlFor="ms-title">Add milestone</Label>
          <Input
            id="ms-title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Send proposal"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ms-date">Due</Label>
          <Input
            id="ms-date"
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={pending || !newTitle.trim()}>
          Add
        </Button>
      </form>
    </div>
  );
}
