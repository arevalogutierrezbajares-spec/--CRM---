import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  STRATEGY_SPINE_STEPS,
  type StrategySpineStepId,
} from "@/lib/strategy-spine";

type StrategySpineProps = {
  active: StrategySpineStepId;
  objectiveCount?: number;
  initiativeCount?: number;
  sprintCount?: number;
  taskCount?: number;
  activeSprintName?: string | null;
};

function countLabel(id: StrategySpineStepId, props: StrategySpineProps): string | null {
  if (id === "priorities" && props.objectiveCount !== undefined) {
    return `${props.objectiveCount} objective${props.objectiveCount === 1 ? "" : "s"}`;
  }
  if (id === "roadmap" && props.initiativeCount !== undefined) {
    return `${props.initiativeCount} initiative${props.initiativeCount === 1 ? "" : "s"}`;
  }
  if (id === "sprint") {
    if (props.activeSprintName) return props.activeSprintName;
    if (props.sprintCount !== undefined) return `${props.sprintCount} sprint${props.sprintCount === 1 ? "" : "s"}`;
  }
  if (id === "tasks" && props.taskCount !== undefined) {
    return `${props.taskCount} task${props.taskCount === 1 ? "" : "s"}`;
  }
  return null;
}

export function StrategySpine(props: StrategySpineProps) {
  return (
    <section
      aria-label="Strategy spine"
      className="rounded-lg border bg-card p-3"
      style={{ borderColor: "var(--border-default)" }}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-text-primary">
            Strategy spine
          </h2>
          <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-text-secondary">
            Mission creates direction. Priorities define winning. Roadmap selects the campaigns.
            Sprint creates focus. Tasks move reality. Review tells the truth.
          </p>
        </div>
        <span className="rounded-full bg-[var(--blue-soft)] px-2 py-1 text-[11px] font-medium text-[var(--blue-text)]">
          Venezuela impact / win
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-6">
        {STRATEGY_SPINE_STEPS.map((step, index) => {
          const Icon = step.icon;
          const active = step.id === props.active;
          const meta = countLabel(step.id, props);
          return (
            <div key={step.id} className="flex min-w-0 items-stretch gap-2">
              <Link
                href={step.href}
                className={`min-w-0 flex-1 rounded-md border px-2.5 py-2 transition-colors ${
                  active
                    ? "border-[var(--blue-mid)] bg-[var(--blue-soft)]"
                    : "border-[var(--border-default)] bg-surface hover:bg-card"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Icon
                    className={`h-3.5 w-3.5 shrink-0 ${
                      active ? "text-[var(--blue-text)]" : "text-text-tertiary"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 truncate text-[12px] font-medium text-text-primary">
                    {step.label}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-text-tertiary">
                  {meta ?? step.intent}
                </p>
              </Link>
              {index < STRATEGY_SPINE_STEPS.length - 1 && (
                <ChevronRight className="mt-5 hidden h-3.5 w-3.5 shrink-0 text-text-tertiary md:block" aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
