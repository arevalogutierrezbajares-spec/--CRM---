import Link from "next/link";
import { Target } from "lucide-react";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { ProgressBar } from "../shared/progress-bar";
import type { SprintWithStats } from "@/db/queries/work";

interface SprintWidgetProps {
  sprint: SprintWithStats | null;
}

function daysLeft(endIso: string): number {
  return Math.max(
    0,
    Math.ceil((new Date(endIso).getTime() - Date.now()) / 86_400_000),
  );
}

export function SprintWidget({ sprint }: SprintWidgetProps) {
  return (
    <DashCard>
      <SectionLabel
        icon={Target}
        right={
          <Link
            href="/sprint"
            className="text-tiny text-text-secondary hover:text-text-primary"
          >
            Open
          </Link>
        }
      >
        Current sprint
      </SectionLabel>
      {!sprint ? (
        <p className="text-[12px] text-text-secondary">
          No active sprint. <Link href="/sprint" className="underline">Start one</Link>.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="text-[12.5px] font-medium text-text-primary truncate">
            {sprint.name}
          </div>
          {sprint.goal && (
            <div className="text-tiny text-text-tertiary line-clamp-2">
              {sprint.goal}
            </div>
          )}
          <ProgressBar pct={sprint.progressPct} />
          <div className="flex justify-between text-tiny text-text-tertiary tabular-nums">
            <span>
              {sprint.taskDoneCount}/{sprint.taskCount} done
            </span>
            <span>{daysLeft(sprint.endDate)}d left</span>
          </div>
        </div>
      )}
    </DashCard>
  );
}
