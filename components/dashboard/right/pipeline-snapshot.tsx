import Link from "next/link";
import { KanbanSquare } from "lucide-react";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import type { PipelineStageBar } from "@/db/queries/dashboard";

interface PipelineSnapshotProps {
  stages: PipelineStageBar[];
}

export function PipelineSnapshot({ stages }: PipelineSnapshotProps) {
  const total = stages.reduce((sum, s) => sum + s.count, 0);
  const max = Math.max(1, ...stages.map((s) => s.count));

  return (
    <DashCard>
      <SectionLabel
        icon={KanbanSquare}
        right={
          <Link
            href="/pipeline"
            className="text-tiny text-text-secondary hover:text-text-primary"
          >
            View
          </Link>
        }
      >
        Pipeline
      </SectionLabel>

      {total === 0 ? (
        <p className="text-[12px] py-3 text-text-secondary">No active projects.</p>
      ) : (
        <div className="space-y-1.5">
          {stages.map((s, i) => {
            const widthPct = Math.round((s.count / max) * 100);
            // Darkening blue ramp from light to dark
            const shadeOpacity = 0.35 + (i / Math.max(1, stages.length - 1)) * 0.6;
            return (
              <div key={s.stageId} className="space-y-1">
                <div className="flex justify-between text-tiny">
                  <span className="text-text-secondary truncate">{s.stageName}</span>
                  <span className="text-text-tertiary tabular-nums">
                    {s.count}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${widthPct}%`,
                      background: `color-mix(in oklab, var(--blue-mid) ${Math.round(shadeOpacity * 100)}%, transparent)`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashCard>
  );
}
