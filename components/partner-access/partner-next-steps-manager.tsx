"use client";

import { useState, useTransition } from "react";
import { Check, Plus, Trash2, User, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/utils";
import type { PartnerNextStep } from "@/db/queries/partner-next-steps";
import {
  createPartnerNextStepAction,
  togglePartnerNextStepAction,
  deletePartnerNextStepAction,
} from "@/app/(app)/partner-access/actions";

function assigneeLabel(assignedTo: string) {
  if (assignedTo === "owner") return "You";
  if (assignedTo === "both") return "Both";
  return "Partner";
}

function assigneeIcon(assignedTo: string) {
  if (assignedTo === "both") return <Users className="h-3 w-3" />;
  return <User className="h-3 w-3" />;
}

export function PartnerNextStepsManager({
  roomId,
  initialSteps,
}: {
  roomId: string;
  initialSteps: PartnerNextStep[];
}) {
  const [steps, setSteps] = useState(initialSteps);
  const [text, setText] = useState("");
  const [assignedTo, setAssignedTo] = useState<"owner" | "partner" | "both">("partner");
  const [dueAt, setDueAt] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    if (!text.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await createPartnerNextStepAction({
        roomId,
        text: text.trim(),
        assignedTo,
        dueAt: dueAt || null,
      });
      if (res.ok) {
        setText("");
        setDueAt("");
        setShowForm(false);
        // Optimistic update — server will revalidate
        setSteps((prev) => [
          ...prev,
          {
            id: res.id,
            workspaceId: "",
            roomId,
            text: text.trim(),
            assignedTo,
            dueAt: dueAt ? new Date(dueAt) : null,
            completedAt: null,
            completedBy: null,
            sortOrder: 0,
            createdByUser: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);
      } else {
        setError(res.error);
      }
    });
  }

  function handleToggle(step: PartnerNextStep) {
    const complete = !step.completedAt;
    startTransition(async () => {
      await togglePartnerNextStepAction({ roomId, stepId: step.id, complete });
      setSteps((prev) =>
        prev.map((s) =>
          s.id === step.id
            ? { ...s, completedAt: complete ? new Date() : null, completedBy: complete ? "owner" : null }
            : s,
        ),
      );
    });
  }

  function handleDelete(stepId: string) {
    startTransition(async () => {
      await deletePartnerNextStepAction({ roomId, stepId });
      setSteps((prev) => prev.filter((s) => s.id !== stepId));
    });
  }

  const open = steps.filter((s) => !s.completedAt);
  const done = steps.filter((s) => s.completedAt);

  return (
    <div className="space-y-3">
      {open.length === 0 && done.length === 0 && !showForm && (
        <p className="text-sm text-[var(--muted-foreground)]">
          No next steps yet. Add items both you and your partner can track.
        </p>
      )}

      {open.length > 0 && (
        <ul className="space-y-2">
          {open.map((step) => (
            <StepRow key={step.id} step={step} onToggle={handleToggle} onDelete={handleDelete} />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            {done.length} completed
          </summary>
          <ul className="mt-2 space-y-2 opacity-60">
            {done.map((step) => (
              <StepRow key={step.id} step={step} onToggle={handleToggle} onDelete={handleDelete} />
            ))}
          </ul>
        </details>
      )}

      {showForm ? (
        <div className="rounded-md border border-[var(--border)] p-3 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Describe the next step…"
            rows={2}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)] resize-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value as "owner" | "partner" | "both")}
              className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs focus:outline-none"
            >
              <option value="partner">Assigned → Partner</option>
              <option value="owner">Assigned → You</option>
              <option value="both">Assigned → Both</option>
            </select>
            <input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs focus:outline-none"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleAdd} disabled={isPending || !text.trim()}>
              Add step
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setText(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setShowForm(true)} className="w-full">
          <Plus className="h-3.5 w-3.5" />
          Add next step
        </Button>
      )}
    </div>
  );
}

function StepRow({
  step,
  onToggle,
  onDelete,
}: {
  step: PartnerNextStep;
  onToggle: (step: PartnerNextStep) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <li className="flex items-start gap-2 rounded-md border border-[var(--border)] p-2.5">
      <button
        type="button"
        onClick={() => onToggle(step)}
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${step.completedAt ? "border-green-500 bg-green-500 text-white" : "border-[var(--border)] hover:border-[var(--foreground)]"}`}
      >
        {step.completedAt && <Check className="h-2.5 w-2.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${step.completedAt ? "line-through text-[var(--muted-foreground)]" : ""}`}>
          {step.text}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--muted-foreground)]">
          <span className="inline-flex items-center gap-1">
            {assigneeIcon(step.assignedTo)}
            {assigneeLabel(step.assignedTo)}
          </span>
          {step.dueAt && (
            <span>· due {formatRelative(step.dueAt)}</span>
          )}
          {step.completedAt && step.completedBy && (
            <Badge variant="outline" className="text-[10px] py-0">
              done by {step.completedBy}
            </Badge>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onDelete(step.id)}
        className="shrink-0 text-[var(--muted-foreground)] hover:text-red-500"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
