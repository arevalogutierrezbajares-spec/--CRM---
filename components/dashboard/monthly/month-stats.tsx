import { CheckCircle2 } from "lucide-react";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { ProgressBar } from "../shared/progress-bar";

interface MonthStatsProps {
  meetingsHeld: number;
  tasksCompleted: number;
  tasksTotal: number;
  projectsActive: number;
  contactsTouched: number;
}

function pct(num: number, denom: number): number {
  if (denom === 0) return 0;
  return Math.round((num / denom) * 100);
}

export function MonthStats({
  meetingsHeld,
  tasksCompleted,
  tasksTotal,
  projectsActive,
  contactsTouched,
}: MonthStatsProps) {
  const completionPct = pct(tasksCompleted, tasksTotal);

  return (
    <DashCard>
      <SectionLabel icon={CheckCircle2}>This month</SectionLabel>
      <div className="space-y-3">
        <Row label="Meetings held" value={meetingsHeld.toString()} />
        <div>
          <Row
            label="Task completion"
            value={`${tasksCompleted}/${tasksTotal} (${completionPct}%)`}
          />
          <ProgressBar pct={completionPct} className="mt-1.5" />
        </div>
        <Row label="Active projects" value={projectsActive.toString()} />
        <Row label="Contacts touched" value={contactsTouched.toString()} />
      </div>
    </DashCard>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-tiny text-text-secondary">{label}</span>
      <span className="text-[13px] font-medium text-text-primary tabular-nums">
        {value}
      </span>
    </div>
  );
}
