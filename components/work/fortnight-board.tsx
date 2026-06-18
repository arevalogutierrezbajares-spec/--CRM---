"use client";

/**
 * Fortnight board — a rolling 2-week view of everything "on the table":
 * open deliverables due within 14 days, overdue, or in progress. Auto-derived
 * from the roadmap (no manual sprint assignment). Re-sliceable by owner /
 * project / due / status, with live counts. Reuses the roadmap's owner bubbles,
 * project tags, and date control.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, Check } from "lucide-react";
import { DateField } from "@/components/roadmap/date-field";
import { PersonChipStack } from "@/components/roadmap/mention-bubbles";
import { toggleRoadmapTask, updateRoadmapTask } from "@/app/(app)/roadmap/actions";

export type FTask = {
  id: string;
  title: string;
  dueDate: string | null;
  status: string;
  project: string | null;
  initiativeTitle: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
};
type Member = { id: string; displayName: string };

const PROJECTS: Record<string, { label: string; color: string }> = {
  caney: { label: "CaneyCloud", color: "var(--blue-mid)" },
  vav: { label: "VAV", color: "var(--green-mid)" },
  all: { label: "All", color: "var(--amber-mid)" },
};
const TODAY = new Date().toISOString().slice(0, 10);
const UNASSIGNED = "__none__";

type GroupBy = "owner" | "project" | "due" | "status";

const fmtDue = (iso: string | null) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;

/** Which "due bucket" a task falls in. */
function dueBucket(iso: string | null): { key: string; label: string; rank: number } {
  if (!iso) return { key: "undated", label: "No date", rank: 3 };
  if (iso < TODAY) return { key: "overdue", label: "Overdue", rank: 0 };
  const wk = new Date();
  wk.setDate(wk.getDate() + 7);
  if (iso <= wk.toISOString().slice(0, 10)) return { key: "thisweek", label: "This week", rank: 1 };
  return { key: "nextweek", label: "Next 2 weeks", rank: 2 };
}

export function FortnightBoard({
  tasks: initial,
  members,
  windowEnd,
}: {
  tasks: FTask[];
  members: Member[];
  windowEnd: string;
}) {
  const [tasks, setTasks] = useState<FTask[]>(initial);
  const [groupBy, setGroupBy] = useState<GroupBy>("owner");
  const [projectFilter, setProjectFilter] = useState<"all" | "caney" | "vav">("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const memberName = useMemo(() => new Map(members.map((m) => [m.id, m.displayName])), [members]);

  // ── mutations (optimistic local + persist) ──
  const markDone = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id)); // done leaves the board
    startTransition(async () => {
      await toggleRoadmapTask(id, true, false);
      router.refresh();
    });
  };
  const reassign = (id: string, userId: string | null) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ownerUserId: userId, ownerName: userId ? memberName.get(userId) ?? null : null } : t)),
    );
    startTransition(async () => {
      await updateRoadmapTask(id, { assigneeUserId: userId }, false);
      router.refresh();
    });
  };
  const reschedule = (id: string, due: string | null) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, dueDate: due } : t)));
    startTransition(async () => {
      await updateRoadmapTask(id, { dueDate: due }, false);
      router.refresh();
    });
  };

  // ── filter ──
  const visible = useMemo(
    () =>
      tasks.filter((t) => {
        if (projectFilter !== "all" && t.project !== projectFilter && t.project !== "all") return false;
        if (overdueOnly && !(t.dueDate && t.dueDate < TODAY)) return false;
        return true;
      }),
    [tasks, projectFilter, overdueOnly],
  );

  // ── summary ──
  const summary = useMemo(() => {
    const overdue = visible.filter((t) => t.dueDate && t.dueDate < TODAY).length;
    const unassigned = visible.filter((t) => !t.ownerUserId).length;
    const byProject: Record<string, number> = {};
    for (const t of visible) {
      const p = t.project ?? "untagged";
      byProject[p] = (byProject[p] ?? 0) + 1;
    }
    return { total: visible.length, overdue, unassigned, byProject };
  }, [visible]);

  // ── grouping ──
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; rank: number; tasks: FTask[] }>();
    const add = (key: string, label: string, rank: number, t: FTask) => {
      if (!map.has(key)) map.set(key, { key, label, rank, tasks: [] });
      map.get(key)!.tasks.push(t);
    };
    for (const t of visible) {
      if (groupBy === "owner") {
        if (t.ownerUserId) add(t.ownerUserId, t.ownerName ?? "—", 0, t);
        else add(UNASSIGNED, "Unassigned", 9, t);
      } else if (groupBy === "project") {
        const p = t.project ?? "untagged";
        add(p, PROJECTS[p]?.label ?? "Untagged", p === "untagged" ? 9 : 0, t);
      } else if (groupBy === "due") {
        const b = dueBucket(t.dueDate);
        add(b.key, b.label, b.rank, t);
      } else {
        add(t.status, t.status, 0, t);
      }
    }
    const arr = [...map.values()];
    // sort groups: by rank then size desc (owner/project) or rank (due)
    arr.sort((a, b) => a.rank - b.rank || b.tasks.length - a.tasks.length || a.label.localeCompare(b.label));
    // sort tasks in each group by due date (nulls last), overdue first
    for (const g of arr)
      g.tasks.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
    return arr;
  }, [visible, groupBy]);

  const groupChips: Array<{ id: GroupBy; label: string }> = [
    { id: "owner", label: "Owner" },
    { id: "project", label: "Project" },
    { id: "due", label: "Due" },
    { id: "status", label: "Status" },
  ];

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg border bg-card px-4 py-2.5" style={{ borderColor: "var(--border-default)" }}>
        <Stat n={summary.total} label="on the table" />
        <Stat n={summary.overdue} label="overdue" tone={summary.overdue ? "red" : undefined} />
        <Stat n={summary.unassigned} label="unassigned" tone={summary.unassigned ? "amber" : undefined} />
        <span className="h-5 w-px" style={{ background: "var(--border-default)" }} />
        {Object.entries(PROJECTS).map(([id, p]) =>
          summary.byProject[id] ? (
            <span key={id} className="inline-flex items-center gap-1 text-[12.5px] text-text-secondary">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
              {p.label} {summary.byProject[id]}
            </span>
          ) : null,
        )}
        <span className="ml-auto text-tiny text-text-tertiary">Through {fmtDue(windowEnd)}</span>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="text-tiny text-text-tertiary mr-0.5">Group by</span>
          {groupChips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setGroupBy(c.id)}
              className="rounded-full border px-2.5 py-0.5 text-[12px] transition-colors"
              style={{
                borderColor: groupBy === c.id ? "var(--blue-mid)" : "var(--border-default)",
                background: groupBy === c.id ? "var(--blue-mid)" : "transparent",
                color: groupBy === c.id ? "#fff" : "var(--text-secondary)",
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {(["all", "caney", "vav"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProjectFilter(p)}
              className="rounded-full border px-2 py-0.5 text-[11.5px]"
              style={{
                borderColor: projectFilter === p ? "var(--blue-mid)" : "var(--border-default)",
                color: projectFilter === p ? "var(--blue-mid)" : "var(--text-secondary)",
              }}
            >
              {p === "all" ? "All projects" : PROJECTS[p].label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setOverdueOnly((v) => !v)}
          className="rounded-full border px-2 py-0.5 text-[11.5px]"
          style={{
            borderColor: overdueOnly ? "var(--red-mid)" : "var(--border-default)",
            color: overdueOnly ? "var(--red-mid)" : "var(--text-secondary)",
          }}
        >
          Overdue only
        </button>
      </div>

      {/* Groups */}
      {groups.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-text-tertiary">Nothing on the table for the next two weeks. 🎉</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const overdue = g.tasks.filter((t) => t.dueDate && t.dueDate < TODAY).length;
            return (
              <section key={g.key}>
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-[13px] font-semibold text-text-primary">{g.label}</h3>
                  <span className="rounded-full bg-surface px-1.5 py-px text-tiny tabular-nums text-text-secondary">{g.tasks.length}</span>
                  {overdue > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-tiny" style={{ color: "var(--red-mid)" }}>
                      <AlertTriangle size={11} /> {overdue}
                    </span>
                  )}
                </div>
                <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--border-default)" }}>
                  {g.tasks.map((t, i) => (
                    <TaskRow
                      key={t.id}
                      t={t}
                      members={members}
                      first={i === 0}
                      onDone={() => markDone(t.id)}
                      onReassign={(u) => reassign(t.id, u)}
                      onReschedule={(d) => reschedule(t.id, d)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: "red" | "amber" }) {
  const color = tone === "red" ? "var(--red-mid)" : tone === "amber" ? "var(--amber-mid)" : "var(--text-primary)";
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[16px] font-semibold tabular-nums" style={{ color }}>{n}</span>
      <span className="text-[12px] text-text-tertiary">{label}</span>
    </span>
  );
}

function TaskRow({
  t,
  members,
  first,
  onDone,
  onReassign,
  onReschedule,
}: {
  t: FTask;
  members: Member[];
  first: boolean;
  onDone: () => void;
  onReassign: (userId: string | null) => void;
  onReschedule: (due: string | null) => void;
}) {
  const overdue = !!(t.dueDate && t.dueDate < TODAY);
  const proj = t.project ? PROJECTS[t.project] : null;
  const mentionPeople = useMemo(() => members.map((m) => ({ userId: m.id, displayName: m.displayName })), [members]);
  return (
    <div
      className="group flex items-center gap-2 px-2.5 py-1.5 hover:bg-surface"
      style={{ borderTop: first ? undefined : "1px solid var(--border-default)" }}
    >
      <button
        type="button"
        onClick={onDone}
        title="Mark done"
        className="grid h-4 w-4 shrink-0 place-items-center rounded-full border text-transparent hover:text-[var(--green-mid)]"
        style={{ borderColor: "var(--border-default)" }}
      >
        <Check size={11} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] text-text-primary">{t.title}</span>
          <PersonChipStack text={t.title} members={mentionPeople} />
        </div>
        {t.initiativeTitle && <div className="truncate text-tiny text-text-tertiary">{t.initiativeTitle}</div>}
      </div>
      {proj && (
        <span
          className="shrink-0 rounded-full border px-1.5 py-px text-[10px] font-semibold"
          style={{ borderColor: proj.color, color: proj.color }}
          title={`Project: ${proj.label}`}
        >
          {proj.label}
        </span>
      )}
      {/* owner picker */}
      <select
        value={t.ownerUserId ?? ""}
        onChange={(e) => onReassign(e.target.value || null)}
        className="shrink-0 rounded border bg-card px-1 py-0.5 text-[11.5px] text-text-secondary"
        style={{ borderColor: "var(--border-default)" }}
        title="Assign owner"
      >
        <option value="">Unassigned</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.displayName}
          </option>
        ))}
      </select>
      {/* due date */}
      <span className="shrink-0" style={overdue ? { color: "var(--red-mid)" } : undefined}>
        {overdue && <CalendarClock size={11} className="mr-0.5 inline" />}
        <DateField value={t.dueDate} onChange={onReschedule} placeholder="due" />
      </span>
    </div>
  );
}
