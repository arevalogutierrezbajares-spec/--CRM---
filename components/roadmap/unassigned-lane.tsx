"use client";

import { useTransition } from "react";
import { setMilestoneInitiative } from "@/app/(app)/work/actions";

type UnassignedTask = {
  id: string;
  title: string;
  dueDate: string | null;
  projectTitle: string;
};

/** FR-UNI-3/5: tasks created without an initiative land here — quarantine,
 *  not silent orphans. Assigning moves them under their initiative at once. */
export function UnassignedLane({
  tasks,
  initiatives,
}: {
  tasks: UnassignedTask[];
  initiatives: Array<{ id: string; title: string }>;
}) {
  const [, startTransition] = useTransition();
  if (tasks.length === 0) return null;

  return (
    <div
      className="rounded-lg border bg-card"
      style={{ borderColor: "var(--amber-mid)" }}
    >
      <div className="px-3 py-2 flex items-center gap-2">
        <span className="text-[13px] font-medium">Unassigned</span>
        <span
          className="text-tiny font-semibold rounded-full px-1.5 py-px"
          style={{
            color: "var(--amber-mid)",
            background: "color-mix(in oklab, var(--amber-mid) 14%, transparent)",
          }}
        >
          {tasks.length}
        </span>
        <span className="text-[12px] text-text-tertiary">
          tasks with no initiative — link them so the roadmap stays honest
        </span>
      </div>
      <ul className="border-t divide-y" style={{ borderColor: "var(--border-default)" }}>
        {tasks.map((t) => (
          <li
            key={t.id}
            className="px-3 py-1.5 flex items-center gap-2"
            style={{ borderColor: "var(--border-default)" }}
          >
            <span className="text-[13px] flex-1 min-w-0 truncate">{t.title}</span>
            <span className="text-[11.5px] text-text-tertiary truncate max-w-[140px]">
              {t.projectTitle}
            </span>
            {t.dueDate && (
              <span className="text-[11.5px] text-text-tertiary tabular-nums">
                {t.dueDate}
              </span>
            )}
            <select
              defaultValue=""
              onChange={(e) => {
                const initiativeId = e.target.value;
                if (initiativeId)
                  startTransition(() => setMilestoneInitiative(t.id, initiativeId));
              }}
              className="rounded border bg-card px-1 py-0.5 text-[12px]"
              style={{ borderColor: "var(--border-default)" }}
            >
              <option value="">Assign…</option>
              {initiatives.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}
