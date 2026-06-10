"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PlanDrift } from "@/lib/plan-drift";
import {
  commitPlan,
  dismissActionItemFromPlanning,
  linkActionItemToInitiative,
  promoteActionItem,
  recordSuccessOutcome,
} from "@/app/(app)/roadmap/actions";

type UnlinkedItem = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  createdAt: string;
  origin: "voice note" | "call" | "manual";
};

type InitiativeOpt = { id: string; title: string };

export function PlanningClient({
  drift,
  unlinked,
  needOutcome,
  initiatives,
  hasBaseline,
}: {
  drift: PlanDrift | null;
  unlinked: UnlinkedItem[];
  needOutcome: Array<{ id: string; title: string; successCriteria: string | null }>;
  initiatives: InitiativeOpt[];
  hasBaseline: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [committed, setCommitted] = useState<number | null>(null);

  const onCommit = () =>
    startTransition(async () => {
      const { version } = await commitPlan(note);
      setCommitted(version);
      router.refresh();
    });

  if (committed) {
    return (
      <div
        className="rounded-lg border bg-card p-5 space-y-1"
        style={{ borderColor: "var(--green-mid)" }}
      >
        <p className="text-[14px] font-medium">Plan v{committed} committed.</p>
        <p className="text-[13px] text-text-secondary">
          This is the new baseline — the next session reviews changes from here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1 — What changed (FR-PLN-1) */}
      <Card title="Since last plan">
        {!hasBaseline ? (
          <p className="text-[13px] text-text-secondary">
            No baseline yet — everything below is your starting plan.
          </p>
        ) : drift === null ? (
          <p className="text-[13px] text-text-secondary">No drift data.</p>
        ) : (
          <DriftPanel drift={drift} />
        )}
      </Card>

      {/* 2 — Unplanned work triage (FR-PLN-2, AIT-2/3) */}
      <Card
        title={`Unplanned work (${unlinked.length})`}
        subtitle="Action items captured outside the plan — link, promote to a task, or dismiss. A heavy month here means the plan is drifting from reality (that's information, not failure)."
      >
        {unlinked.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            Queue is clear — everything captured is linked or reviewed.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--border-default)" }}>
            {unlinked.map((item) => (
              <TriageRow key={item.id} item={item} initiatives={initiatives} />
            ))}
          </ul>
        )}
      </Card>

      {/* 3 — Outcomes (FR-PLN-4) */}
      {needOutcome.length > 0 && (
        <Card
          title={`Completed initiatives — record outcomes (${needOutcome.length})`}
        >
          <ul className="space-y-3">
            {needOutcome.map((i) => (
              <OutcomeRow key={i.id} initiative={i} />
            ))}
          </ul>
        </Card>
      )}

      {/* 4 — Commit (FR-PLN-3) */}
      <Card title="Commit the plan">
        <div className="space-y-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Session note (optional) — e.g. 'June session: pushed launch to Q3'"
            className="w-full rounded-md border bg-card px-2.5 py-1.5 text-[13px]"
            style={{ borderColor: "var(--border-default)" }}
          />
          <button
            type="button"
            onClick={onCommit}
            disabled={pending}
            className="rounded-md px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
            style={{ background: "var(--blue-mid)" }}
          >
            {pending ? "Committing…" : "Commit Plan"}
          </button>
          <p className="text-[12px] text-text-tertiary">
            Snapshots the current roadmap as the new baseline. Adjust anything on
            the roadmap first — then commit once.
          </p>
        </div>
      </Card>
    </div>
  );
}

/* ─── Pieces ──────────────────────────────────────────────────────────── */

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-lg border bg-card p-4 space-y-2"
      style={{ borderColor: "var(--border-default)" }}
    >
      <div>
        <h2 className="text-[14px] font-medium">{title}</h2>
        {subtitle && <p className="text-[12px] text-text-tertiary mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function DriftPanel({ drift }: { drift: PlanDrift }) {
  const empty =
    drift.newInitiatives.length +
      drift.goneInitiatives.length +
      drift.dateSlips.length +
      drift.tasksCompleted.length +
      drift.tasksAdded.length +
      drift.tasksReopened.length ===
    0;
  if (empty) {
    return (
      <p className="text-[13px] text-text-secondary">
        Nothing changed since the last plan.
      </p>
    );
  }
  return (
    <div className="space-y-2 text-[13px]">
      {drift.tasksCompleted.length > 0 && (
        <DriftGroup
          label={`Completed (${drift.tasksCompleted.length})`}
          color="var(--green-mid)"
          items={drift.tasksCompleted.map((t) => `${t.title} — ${t.initiativeTitle}`)}
        />
      )}
      {drift.dateSlips.length > 0 && (
        <DriftGroup
          label={`Date changes (${drift.dateSlips.length})`}
          color="var(--amber-mid)"
          items={drift.dateSlips.map(
            (s) => `${s.title}: ${s.planned ?? "—"} → ${s.now ?? "—"}`,
          )}
        />
      )}
      {drift.tasksAdded.length > 0 && (
        <DriftGroup
          label={`Added since plan (${drift.tasksAdded.length})`}
          color="var(--blue-mid)"
          items={drift.tasksAdded.map((t) => `${t.title} — ${t.initiativeTitle}`)}
        />
      )}
      {drift.tasksReopened.length > 0 && (
        <DriftGroup
          label={`Reopened (${drift.tasksReopened.length})`}
          color="var(--red-mid)"
          items={drift.tasksReopened.map((t) => `${t.title} — ${t.initiativeTitle}`)}
        />
      )}
      {drift.newInitiatives.length > 0 && (
        <DriftGroup
          label={`New initiatives (${drift.newInitiatives.length})`}
          color="var(--blue-mid)"
          items={drift.newInitiatives.map((i) => i.title)}
        />
      )}
      {drift.goneInitiatives.length > 0 && (
        <DriftGroup
          label={`Archived (${drift.goneInitiatives.length})`}
          color="var(--red-mid)"
          items={drift.goneInitiatives.map((i) => i.title)}
        />
      )}
    </div>
  );
}

function DriftGroup({
  label,
  color,
  items,
}: {
  label: string;
  color: string;
  items: string[];
}) {
  return (
    <div>
      <p className="text-[12px] font-semibold mb-0.5" style={{ color }}>
        {label}
      </p>
      <ul className="space-y-0.5">
        {items.slice(0, 12).map((s, i) => (
          <li key={i} className="text-text-secondary truncate">
            {s}
          </li>
        ))}
        {items.length > 12 && (
          <li className="text-text-tertiary">…and {items.length - 12} more</li>
        )}
      </ul>
    </div>
  );
}

function TriageRow({
  item,
  initiatives,
}: {
  item: UnlinkedItem;
  initiatives: InitiativeOpt[];
}) {
  const [pending, startTransition] = useTransition();
  const [gone, setGone] = useState(false);
  const [mode, setMode] = useState<"link" | "promote" | null>(null);
  if (gone) return null;

  const act = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      setGone(true);
    });

  return (
    <li
      className="py-2 flex items-center gap-2 flex-wrap"
      style={{ borderColor: "var(--border-default)" }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] truncate">{item.title}</p>
        <p className="text-[11.5px] text-text-tertiary">
          {item.origin} · {new Date(item.createdAt).toLocaleDateString()}
          {item.dueDate ? ` · due ${item.dueDate}` : ""}
        </p>
      </div>
      {mode === null ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <SmallBtn onClick={() => setMode("link")}>Link</SmallBtn>
          <SmallBtn onClick={() => setMode("promote")}>Promote to task</SmallBtn>
          <SmallBtn
            onClick={() => act(() => dismissActionItemFromPlanning(item.id))}
            muted
          >
            Dismiss
          </SmallBtn>
        </div>
      ) : (
        <select
          autoFocus
          defaultValue=""
          disabled={pending}
          onChange={(e) => {
            const initiativeId = e.target.value;
            if (!initiativeId) return setMode(null);
            act(() =>
              mode === "link"
                ? linkActionItemToInitiative(item.id, initiativeId)
                : promoteActionItem(item.id, initiativeId),
            );
          }}
          className="rounded border bg-card px-1.5 py-1 text-[12px] shrink-0"
          style={{ borderColor: "var(--border-default)" }}
        >
          <option value="">
            {mode === "link" ? "Link to initiative…" : "Promote into…"}
          </option>
          {initiatives.map((i) => (
            <option key={i.id} value={i.id}>
              {i.title}
            </option>
          ))}
        </select>
      )}
    </li>
  );
}

function OutcomeRow({
  initiative,
}: {
  initiative: { id: string; title: string; successCriteria: string | null };
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<string | null>(null);

  const record = (outcome: "met" | "partial" | "missed") =>
    startTransition(async () => {
      await recordSuccessOutcome(initiative.id, outcome);
      setDone(outcome);
    });

  return (
    <li className="space-y-1">
      <p className="text-[13px] font-medium">{initiative.title}</p>
      {initiative.successCriteria && (
        <p className="text-[12.5px] text-text-secondary">
          Success was: {initiative.successCriteria}
        </p>
      )}
      {done ? (
        <p className="text-[12.5px] text-text-tertiary">Recorded: {done}</p>
      ) : (
        <div className="flex items-center gap-1.5">
          <SmallBtn onClick={() => record("met")} disabled={pending}>
            Met
          </SmallBtn>
          <SmallBtn onClick={() => record("partial")} disabled={pending}>
            Partially
          </SmallBtn>
          <SmallBtn onClick={() => record("missed")} disabled={pending}>
            Missed
          </SmallBtn>
        </div>
      )}
    </li>
  );
}

function SmallBtn({
  children,
  onClick,
  muted,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  muted?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded border px-2 py-1 text-[12px] font-medium transition-colors disabled:opacity-50 ${
        muted
          ? "text-text-tertiary hover:text-text-secondary"
          : "text-text-primary hover:bg-surface"
      }`}
      style={{ borderColor: "var(--border-default)" }}
    >
      {children}
    </button>
  );
}
