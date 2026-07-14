"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, Check, CheckSquare, Users } from "lucide-react";
import { useRoomActivity } from "@/components/partner-access/room-activity-context";
import { useRoomDict, useRoomI18n } from "@/components/partner-access/room-i18n";
import type { PartnerNextStep } from "@/db/queries/partner-next-steps";

type CompletionOverride = Pick<PartnerNextStep, "completedAt" | "completedBy">;

export function PublicNextSteps({
  token,
  initialSteps,
  nowMs,
}: {
  token: string;
  initialSteps: PartnerNextStep[];
  nowMs: number;
}) {
  const t = useRoomDict();
  // Display derives from the server snapshot + local completion overrides
  // (never seed-then-drift): a router.refresh with new/edited steps flows
  // straight through, while optimistic toggles stay instant.
  const [overrides, setOverrides] = useState<Record<string, CompletionOverride>>(
    {},
  );
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const activity = useRoomActivity();
  const prevOpenRef = useRef<number | null>(null);

  const steps = initialSteps.map((s) =>
    overrides[s.id] ? { ...s, ...overrides[s.id] } : s,
  );
  const openCount = steps.filter((s) => !s.completedAt).length;

  async function handleToggle(step: PartnerNextStep) {
    if (pending.has(step.id)) return;
    const completing = !step.completedAt;
    setPending((prev) => new Set(prev).add(step.id));
    setError(null);
    prevOpenRef.current = openCount;

    // Optimistic flip; rolled back if the server disagrees.
    const optimistic: CompletionOverride = completing
      ? { completedAt: new Date(), completedBy: "partner" }
      : { completedAt: null, completedBy: null };
    setOverrides((prev) => ({ ...prev, [step.id]: optimistic }));
    const nextOpen = openCount + (completing ? -1 : 1);
    activity?.setOpenSteps(nextOpen);
    if (completing && nextOpen === 0) setCelebrate(true);

    try {
      const res = await fetch(`/api/access/${token}/next-steps/${step.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complete: completing }),
      });
      if (res.ok) {
        const updated = (await res.json()) as PartnerNextStep;
        setOverrides((prev) => ({
          ...prev,
          [step.id]: {
            completedAt: updated.completedAt,
            completedBy: updated.completedBy,
          },
        }));
      } else {
        throw new Error("save-failed");
      }
    } catch {
      // Roll back the flip.
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[step.id];
        return next;
      });
      activity?.setOpenSteps(openCount);
      setCelebrate(false);
      setError(t.nextSteps.saveError);
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
      <>
        <Header openCount={0} />
        <p className="mt-3 text-sm text-[var(--muted-foreground)]">
          {t.nextSteps.empty}
        </p>
      </>
    );
  }

  // Open items first, sorted by due date (timeline); dated before undated;
  // completed sink to the bottom (layout animation makes the move visible).
  const ordered = [...steps].sort((a, b) => {
    const aDone = a.completedAt ? 1 : 0;
    const bDone = b.completedAt ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
    const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
    return aDue - bDue;
  });

  return (
    <div>
      {/* Header lives here (client) so the pending badge tracks toggles. */}
      <Header openCount={openCount} />
      <div className="mb-2 mt-3 text-xs text-[var(--muted-foreground)]">
        {openCount > 0 ? (
          t.nextSteps.markHint
        ) : (
          <AllDone celebrate={celebrate} />
        )}
      </div>
      {error && (
        <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      <ul className="max-h-[360px] space-y-2 overflow-y-auto pe-1">
        {ordered.map((step) => {
          const interactive =
            step.assignedTo === "partner" || step.assignedTo === "both";
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

/** The moment the last step closes: a spring-in check + gold burst. */
function AllDone({ celebrate }: { celebrate: boolean }) {
  const t = useRoomDict();
  return (
    <span className="relative inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
      <motion.span
        initial={celebrate ? { scale: 0, rotate: -45 } : false}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 16 }}
        className="grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-white"
      >
        <Check className="h-3 w-3" />
      </motion.span>
      {t.nextSteps.allDone}
      {celebrate && (
        <span aria-hidden className="pointer-events-none absolute -start-1 top-1/2">
          {Array.from({ length: 8 }, (_, i) => {
            const angle = (i / 8) * Math.PI * 2;
            return (
              <motion.span
                key={i}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{
                  x: Math.cos(angle) * 26,
                  y: Math.sin(angle) * 26,
                  opacity: 0,
                  scale: 0.4,
                }}
                transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }}
                className="absolute h-1.5 w-1.5 rounded-full bg-amber-400"
              />
            );
          })}
        </span>
      )}
    </span>
  );
}

function Header({ openCount }: { openCount: number }) {
  const t = useRoomDict();
  return (
    <div className="flex items-center gap-2">
      <CheckSquare className="h-4 w-4 text-[var(--muted-foreground)]" />
      <h2 className="text-base font-semibold">{t.nextSteps.title}</h2>
      <AnimatePresence>
        {openCount > 0 && (
          <motion.span
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            className="ms-auto overflow-hidden rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={openCount}
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -8, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="inline-block tabular-nums"
              >
                {t.nextSteps.pendingBadge(openCount)}
              </motion.span>
            </AnimatePresence>
          </motion.span>
        )}
      </AnimatePresence>
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
  const { t, rel } = useRoomI18n();
  const done = Boolean(step.completedAt);
  const checkFace = (
    <AnimatePresence initial={false}>
      {done && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 18 }}
          className="grid place-items-center"
        >
          <Check className="h-3 w-3" />
        </motion.span>
      )}
    </AnimatePresence>
  );
  return (
    <motion.li
      layout
      transition={{ layout: { type: "spring", stiffness: 380, damping: 32 } }}
      className={`flex items-start gap-2.5 rounded-lg border p-3 transition-colors duration-300 ${
        overdue
          ? "border-red-300 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20"
          : "border-[var(--border)]"
      }`}
    >
      {interactive ? (
        <motion.button
          type="button"
          disabled={loading}
          onClick={() => onToggle?.(step)}
          whileTap={{ scale: 0.8 }}
          aria-label={done ? t.nextSteps.markPending : t.nextSteps.markDone}
          className={`relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-300 after:absolute after:-inset-3 after:content-[''] ${
            done
              ? "border-green-500 bg-green-500 text-white"
              : "border-[var(--border)] hover:border-[var(--foreground)]"
          } disabled:opacity-50`}
        >
          {checkFace}
        </motion.button>
      ) : (
        <div
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-300 ${
            done ? "border-green-500 bg-green-500 text-white" : "border-[var(--border)]"
          }`}
        >
          {checkFace}
        </div>
      )}
      <div className="min-w-0 flex-1">
        {/* Strike-through draws itself across the text on completion. */}
        <p
          className={`relative w-fit text-sm leading-5 transition-colors duration-300 ${
            done ? "text-[var(--muted-foreground)]" : ""
          }`}
        >
          {step.text}
          <motion.span
            aria-hidden
            initial={false}
            animate={{ scaleX: done ? 1 : 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            style={{ originX: 0 }}
            className="absolute start-0 top-1/2 h-px w-full bg-current"
          />
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded bg-[var(--secondary)] px-1.5 py-0.5 text-[10px] text-[var(--secondary-foreground)]">
            <Users className="h-3 w-3" />
            {t.nextSteps.assignee[
              step.assignedTo as keyof typeof t.nextSteps.assignee
            ] ?? t.nextSteps.assignee.default}
          </span>
          {step.dueAt && !done && (
            <span
              className={`inline-flex items-center gap-1 ${
                overdue
                  ? "font-medium text-red-600 dark:text-red-400"
                  : "text-[var(--muted-foreground)]"
              }`}
            >
              <CalendarClock className="h-3 w-3" />
              {overdue ? t.nextSteps.overdue : t.nextSteps.due}{" "}
              {rel(step.dueAt)}
            </span>
          )}
          {done && (
            <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
              <Check className="h-3 w-3" />
              {t.nextSteps.done}
            </span>
          )}
        </div>
      </div>
    </motion.li>
  );
}
