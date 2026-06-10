"use client";

import { useState } from "react";
import { CalendarClock, Check, Users } from "lucide-react";
import { formatRelative } from "@/lib/utils";
import type { PartnerNextStep } from "@/db/queries/partner-next-steps";

const ASSIGNEE_LABEL: Record<string, string> = {
  partner: "Para ti",
  owner: "El equipo",
  both: "Ambos",
};

export function PublicNextSteps({
  token,
  initialSteps,
  nowMs,
}: {
  token: string;
  initialSteps: PartnerNextStep[];
  nowMs: number;
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
        const updated = (await res.json()) as PartnerNextStep;
        setSteps((prev) =>
          prev.map((s) =>
            s.id === step.id
              ? { ...s, completedAt: updated.completedAt, completedBy: updated.completedBy }
              : s,
          ),
        );
      }
    } finally {
      setPending((prev) => {
        const n = new Set(prev);
        n.delete(step.id);
        return n;
      });
    }
  }

  if (steps.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        Aún no hay próximos pasos. Aquí verás lo que sigue.
      </p>
    );
  }

  // Open items first, sorted by due date (timeline); dated before undated;
  // completed sink to the bottom.
  const ordered = [...steps].sort((a, b) => {
    const aDone = a.completedAt ? 1 : 0;
    const bDone = b.completedAt ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
    const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
    return aDue - bDue;
  });

  const openCount = steps.filter((s) => !s.completedAt).length;

  return (
    <div>
      <p className="mb-2 text-xs text-[var(--muted-foreground)]">
        {openCount > 0 ? `${openCount} pendiente${openCount === 1 ? "" : "s"}` : "Todo al día ✓"}
      </p>
      <ul className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
        {ordered.map((step) => {
          const interactive = step.assignedTo === "partner" || step.assignedTo === "both";
          const overdue =
            !step.completedAt && step.dueAt && new Date(step.dueAt).getTime() < nowMs;
          return (
            <StepItem
              key={step.id}
              step={step}
              interactive={interactive}
              overdue={Boolean(overdue)}
              loading={pending.has(step.id)}
              onToggle={interactive ? handleToggle : undefined}
            />
          );
        })}
      </ul>
    </div>
  );
}

function StepItem({
  step,
  interactive,
  overdue,
  loading,
  onToggle,
}: {
  step: PartnerNextStep;
  interactive: boolean;
  overdue: boolean;
  loading?: boolean;
  onToggle?: (step: PartnerNextStep) => void;
}) {
  const done = Boolean(step.completedAt);
  return (
    <li
      className={`flex items-start gap-2.5 rounded-lg border p-3 ${
        overdue ? "border-red-300 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20" : "border-[var(--border)]"
      }`}
    >
      {interactive ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => onToggle?.(step)}
          aria-label={done ? "Marcar como pendiente" : "Marcar como hecho"}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
            done
              ? "border-green-500 bg-green-500 text-white"
              : "border-[var(--border)] hover:border-[var(--foreground)]"
          } disabled:opacity-50`}
        >
          {done && <Check className="h-3 w-3" />}
        </button>
      ) : (
        <div
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
            done ? "border-green-500 bg-green-500 text-white" : "border-[var(--border)]"
          }`}
        >
          {done && <Check className="h-3 w-3" />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-5 ${done ? "text-[var(--muted-foreground)] line-through" : ""}`}>
          {step.text}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded bg-[var(--secondary)] px-1.5 py-0.5 text-[10px] text-[var(--secondary-foreground)]">
            <Users className="h-3 w-3" />
            {ASSIGNEE_LABEL[step.assignedTo] ?? "Para ti"}
          </span>
          {step.dueAt && !done && (
            <span
              className={`inline-flex items-center gap-1 ${
                overdue ? "font-medium text-red-600 dark:text-red-400" : "text-[var(--muted-foreground)]"
              }`}
            >
              <CalendarClock className="h-3 w-3" />
              {overdue ? "Vencido " : "Para "}
              {formatRelative(step.dueAt)}
            </span>
          )}
          {done && (
            <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
              <Check className="h-3 w-3" />
              Hecho
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
