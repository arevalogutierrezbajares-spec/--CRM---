"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";
import type { PartnerNextStep } from "@/db/queries/partner-next-steps";

export function PublicNextSteps({
  token,
  initialSteps,
}: {
  token: string;
  initialSteps: PartnerNextStep[];
}) {
  const [steps, setSteps] = useState(initialSteps);
  const [pending, setPending] = useState<Set<string>>(new Set());

  async function handleToggle(step: PartnerNextStep) {
    if (pending.has(step.id)) return;
    setPending((prev) => new Set(prev).add(step.id));
    try {
      const res = await fetch(`/api/access/${token}/next-steps/${step.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complete: !step.completedAt }),
      });
      if (res.ok) {
        const updated = await res.json() as PartnerNextStep;
        setSteps((prev) => prev.map((s) => s.id === step.id ? { ...s, completedAt: updated.completedAt, completedBy: updated.completedBy } : s));
      }
    } finally {
      setPending((prev) => { const n = new Set(prev); n.delete(step.id); return n; });
    }
  }

  const mySteps = steps.filter((s) => s.assignedTo === "partner" || s.assignedTo === "both");
  const theirSteps = steps.filter((s) => s.assignedTo === "owner");

  if (steps.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No next steps have been set yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {mySteps.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">Your action items</p>
          <ul className="space-y-2">
            {mySteps.map((step) => (
              <StepItem
                key={step.id}
                step={step}
                interactive
                loading={pending.has(step.id)}
                onToggle={handleToggle}
              />
            ))}
          </ul>
        </div>
      )}

      {theirSteps.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">On their side</p>
          <ul className="space-y-2">
            {theirSteps.map((step) => (
              <StepItem key={step.id} step={step} interactive={false} onToggle={() => {}} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StepItem({
  step,
  interactive,
  loading,
  onToggle,
}: {
  step: PartnerNextStep;
  interactive: boolean;
  loading?: boolean;
  onToggle: (step: PartnerNextStep) => void;
}) {
  return (
    <li className="flex items-start gap-2.5 rounded-lg border border-[var(--border)] p-3">
      {interactive ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => onToggle(step)}
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
            step.completedAt
              ? "border-green-500 bg-green-500 text-white"
              : "border-[var(--border)] hover:border-[var(--foreground)]"
          } disabled:opacity-50`}
        >
          {step.completedAt && <Check className="h-2.5 w-2.5" />}
        </button>
      ) : (
        <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${step.completedAt ? "border-green-500 bg-green-500 text-white" : "border-[var(--border)]"}`}>
          {step.completedAt && <Check className="h-2.5 w-2.5" />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${step.completedAt ? "line-through text-[var(--muted-foreground)]" : ""}`}>
          {step.text}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
          {step.dueAt && <span>Due {formatRelative(step.dueAt)}</span>}
          {step.completedAt && (
            <Badge variant="outline" className="text-[10px] py-0">Completed</Badge>
          )}
        </div>
      </div>
    </li>
  );
}
