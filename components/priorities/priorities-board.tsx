"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Target, Check, BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createObjectiveAction,
  updateObjectiveAction,
  deleteObjectiveAction,
  createKeyResultAction,
  updateKeyResultAction,
  deleteKeyResultAction,
} from "@/app/(app)/priorities/actions";
import type {
  ObjectiveView,
  KeyResultView,
  ObjectiveStatus,
} from "@/db/queries/okrs";
import { fmtVal, HEALTH_LABEL } from "@/lib/priorities/format";

// Re-exported for back-compat with existing importers.
export { fmtVal, HEALTH_LABEL };

type Member = { userId: string; displayName: string };

const HEALTH: Record<string, string> = {
  green: "var(--green-mid)",
  amber: "var(--amber-text)",
  red: "var(--red-text)",
};
const STATUS_LABEL: Record<ObjectiveStatus, string> = {
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
  done: "Done",
};
const STATUS_TONE: Record<ObjectiveStatus, string> = {
  on_track: "var(--green-mid)",
  at_risk: "var(--amber-text)",
  off_track: "var(--red-text)",
  done: "var(--blue-text)",
};

export function PrioritiesBoard({
  quarter,
  quarters,
  objectives,
  members,
}: {
  quarter: string;
  quarters: string[];
  objectives: ObjectiveView[];
  members: Member[];
}) {
  const router = useRouter();
  const [newTitle, setNewTitle] = useState("");
  const [newOwner, setNewOwner] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  function refresh() {
    router.refresh();
  }

  // Delete with a 5s undo window — no confirm dialog. The row hides instantly;
  // the actual delete only commits when the toast closes un-undone.
  function deleteWithUndo(o: ObjectiveView) {
    setHidden((s) => new Set(s).add(o.id));
    let undone = false;
    const unhide = () =>
      setHidden((s) => {
        const n = new Set(s);
        n.delete(o.id);
        return n;
      });
    const commit = () => {
      if (undone) return;
      void deleteObjectiveAction(o.id).then((res) => {
        if (res.ok) router.refresh();
        else {
          toast.error(res.error);
          unhide();
        }
      });
    };
    toast(`Deleted “${o.title}”`, {
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          undone = true;
          unhide();
        },
      },
      onAutoClose: commit,
      onDismiss: commit,
    });
  }

  async function addObjective() {
    if (adding || !newTitle.trim()) return;
    setAdding(true);
    const res = await createObjectiveAction({
      title: newTitle,
      quarter,
      ownerId: newOwner || null,
    });
    setAdding(false);
    if (res.ok) {
      setNewTitle("");
      setNewOwner("");
      toast.success("Objective added");
      refresh();
    } else {
      toast.error(res.error);
    }
  }

  const atCount = objectives.length;

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-[26px] leading-none text-text-primary">Priorities</h1>
          <span className="text-tiny text-text-tertiary">{atCount}/7 this quarter</span>
        </div>
        <Select value={quarter} onValueChange={(q) => router.push(`/priorities?q=${q}`)}>
          <SelectTrigger className="h-8 w-[130px] text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {quarters.map((q) => (
              <SelectItem key={q} value={q}>{q}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-[13px] text-text-secondary">
        Your 3-7 quarterly objectives — each with one owner and measurable key results. Keep it
        short; the cap is the feature. Key results flagged ★ feed the Home scorecard.
      </p>

      {/* add objective */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-card p-2.5">
        <Target size={15} className="ml-1 shrink-0 text-text-tertiary" />
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void addObjective();
            }
          }}
          placeholder="New objective for this quarter…"
          className="h-8 min-w-[200px] flex-1 text-[13px]"
        />
        <Select value={newOwner} onValueChange={setNewOwner}>
          <SelectTrigger className="h-8 w-[140px] text-[13px]">
            <SelectValue placeholder="Owner" />
          </SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.userId} value={m.userId}>{m.displayName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" onClick={addObjective} loading={adding} disabled={!newTitle.trim()}>
          <Plus size={14} /> Add
        </Button>
      </div>

      {/* objectives */}
      {objectives.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] py-10 text-center">
          <Target size={22} className="mx-auto mb-2 text-text-tertiary" />
          <p className="text-[13px] text-text-secondary">No objectives for {quarter} yet.</p>
          <p className="text-tiny text-text-tertiary">Add your first quarterly priority above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {objectives
            .filter((o) => !hidden.has(o.id))
            .map((o) => (
              <ObjectiveCard key={o.id} objective={o} members={members} onChanged={refresh} onDelete={() => deleteWithUndo(o)} />
            ))}
        </div>
      )}
    </div>
  );
}

function ObjectiveCard({
  objective: o,
  members,
  onChanged,
  onDelete,
}: {
  objective: ObjectiveView;
  members: Member[];
  onChanged: () => void;
  onDelete: () => void;
}) {
  const [, startTransition] = useTransition();
  const hasKr = o.keyResults.length > 0;
  const pct = Math.round(o.progress * 100);

  function setStatus(status: ObjectiveStatus) {
    startTransition(async () => {
      const res = await updateObjectiveAction({ id: o.id, status });
      if (res.ok) onChanged();
      else toast.error(res.error);
    });
  }
  function setOwner(ownerId: string) {
    startTransition(async () => {
      const res = await updateObjectiveAction({ id: o.id, ownerId: ownerId || null });
      if (res.ok) onChanged();
      else toast.error(res.error);
    });
  }
  return (
    <div className="rounded-lg border border-[var(--border)] bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: STATUS_TONE[o.status] }}
              title={STATUS_LABEL[o.status]}
            />
            <h2 className="truncate text-[15px] font-medium text-text-primary">{o.title}</h2>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {hasKr ? (
              <>
                <div className="h-1.5 w-40 overflow-hidden rounded-full bg-surface">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--green-mid)" }} />
                </div>
                <span className="text-tiny tabular-nums text-text-tertiary">{pct}%</span>
              </>
            ) : (
              <span className="text-tiny text-text-tertiary">No key results yet — add a measurable target below.</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Select value={o.status} onValueChange={(v) => setStatus(v as ObjectiveStatus)}>
            <SelectTrigger className="h-7 w-[108px] text-tiny">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_LABEL) as ObjectiveStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={o.ownerId ?? ""} onValueChange={setOwner}>
            <SelectTrigger className="h-7 w-[120px] text-tiny">
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.userId} value={m.userId}>{m.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete objective"
            className="rounded p-1 text-text-tertiary hover:text-[var(--red-text)]"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* key results */}
      <div className="mt-3 space-y-1.5 border-t border-[var(--border)] pt-3">
        {o.keyResults.map((kr) => (
          <KrRow key={kr.id} kr={kr} onChanged={onChanged} />
        ))}
        <AddKr objectiveId={o.id} onChanged={onChanged} />
      </div>
    </div>
  );
}

function KrRow({ kr, onChanged }: { kr: KeyResultView; onChanged: () => void }) {
  const [, startTransition] = useTransition();
  const [val, setVal] = useState(String(kr.current));
  const pct = Math.round(kr.progress * 100);

  function save() {
    const num = Number(val);
    if (!Number.isFinite(num) || num === kr.current) return;
    startTransition(async () => {
      const res = await updateKeyResultAction({ id: kr.id, current: num });
      if (res.ok) onChanged();
      else toast.error(res.error);
    });
  }
  function toggleScorecard() {
    startTransition(async () => {
      const res = await updateKeyResultAction({ id: kr.id, onScorecard: !kr.onScorecard });
      if (res.ok) onChanged();
      else toast.error(res.error);
    });
  }
  function remove() {
    startTransition(async () => {
      const res = await deleteKeyResultAction(kr.id);
      if (res.ok) onChanged();
      else toast.error(res.error);
    });
  }

  return (
    <div className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-surface">
      <span role="img" aria-label={`Health: ${HEALTH_LABEL[kr.health]}`} className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: HEALTH[kr.health] }} title={HEALTH_LABEL[kr.health]} />
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-primary">{kr.title}</span>
      {kr.ownerName && <span className="hidden shrink-0 text-tiny text-text-tertiary sm:inline">{kr.ownerName}</span>}
      <div className="hidden h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-surface sm:block">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: HEALTH[kr.health] }} />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-label={`Current value for ${kr.title}`}
          inputMode="decimal"
          className="h-6 w-16 px-1.5 text-right text-tiny tabular-nums"
        />
        <span className="w-16 shrink-0 text-tiny tabular-nums text-text-tertiary">/ {fmtVal(kr.target, kr.unit)}</span>
      </div>
      <button
        type="button"
        onClick={toggleScorecard}
        aria-label={kr.onScorecard ? "Remove from scorecard" : "Add to scorecard"}
        title={kr.onScorecard ? "On Home scorecard" : "Add to Home scorecard"}
        className={`shrink-0 rounded p-0.5 ${kr.onScorecard ? "text-gold" : "text-text-tertiary opacity-0 group-hover:opacity-100"}`}
      >
        <BarChart3 size={12} />
      </button>
      <button
        type="button"
        onClick={remove}
        aria-label="Delete key result"
        className="shrink-0 rounded p-0.5 text-text-tertiary opacity-0 transition-opacity hover:text-[var(--red-text)] group-hover:opacity-100"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function AddKr({ objectiveId, onChanged }: { objectiveId: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [direction, setDirection] = useState<"higher" | "lower">("higher");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (busy || !title.trim() || !target.trim()) return;
    const targetNum = Number(target);
    const startNum = start.trim() ? Number(start) : 0;
    if (!Number.isFinite(targetNum) || !Number.isFinite(startNum)) {
      toast.error("Start and target must be numbers.");
      return;
    }
    setBusy(true);
    const res = await createKeyResultAction({
      objectiveId,
      title,
      target: targetNum,
      startValue: startNum,
      current: startNum, // start at the baseline → 0% progress
      direction,
      unit: unit.trim() || null,
    });
    setBusy(false);
    if (res.ok) {
      setTitle("");
      setStart("");
      setTarget("");
      setUnit("");
      setDirection("higher");
      setOpen(false);
      onChanged();
    } else {
      toast.error(res.error);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md px-1 py-1 text-tiny text-text-tertiary hover:text-text-secondary"
      >
        <Plus size={12} /> Add key result
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-surface px-1.5 py-1.5">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void add())}
        placeholder="Key result (e.g. MRR)…"
        autoFocus
        className="h-7 min-w-[150px] flex-1 text-tiny"
      />
      <button
        type="button"
        onClick={() => setDirection((d) => (d === "higher" ? "lower" : "higher"))}
        title={direction === "higher" ? "Increase (higher is better)" : "Decrease (lower is better)"}
        aria-label={`Direction: ${direction === "higher" ? "increase" : "decrease"} — click to toggle`}
        className="flex h-7 shrink-0 items-center gap-0.5 rounded-md border border-[var(--border)] px-1.5 text-tiny text-text-secondary hover:bg-card"
      >
        {direction === "higher" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      </button>
      <Input
        value={start}
        onChange={(e) => setStart(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void add())}
        placeholder="From"
        inputMode="decimal"
        title="Starting value (baseline)"
        className="h-7 w-16 text-tiny"
      />
      <Input
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void add())}
        placeholder="To (target)"
        inputMode="decimal"
        className="h-7 w-20 text-tiny"
      />
      <Input
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void add())}
        placeholder="$ / % / unit"
        className="h-7 w-24 text-tiny"
      />
      <Button type="button" size="sm" variant="ghost" onClick={add} loading={busy}>
        <Check size={13} /> Save
      </Button>
      <button type="button" onClick={() => setOpen(false)} className="text-tiny text-text-tertiary hover:text-text-secondary">
        Cancel
      </button>
    </div>
  );
}
