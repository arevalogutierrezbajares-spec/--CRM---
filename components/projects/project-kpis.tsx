import { HealthBadge } from "@/components/ui/health-badge";
import { DashBadge, type BadgeVariant } from "@/components/dashboard/shared/badge";
import { ProgressBar } from "@/components/dashboard/shared/progress-bar";
import { formatDate, formatRelative } from "@/lib/utils";
import type { HealthColor } from "@/lib/health";

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  active: "blue",
  waiting: "amber",
  done: "green",
  lost: "neutral",
};

export interface ProjectKpisProps {
  health: HealthColor;
  status: string;
  progressPct: number;
  done: number;
  total: number;
  open: number;
  overdue: number;
  contacts: number;
  stageName: string | null;
  dueDate: string | null;
  updatedAt: Date | string;
  touchCount: number;
}

/** Presentational KPI grid for the project Overview tab. */
export function ProjectKpis({
  health,
  status,
  progressPct,
  done,
  total,
  open,
  overdue,
  contacts,
  stageName,
  dueDate,
  updatedAt,
  touchCount,
}: ProjectKpisProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <Tile label="Health">
          <HealthBadge health={health} short />
        </Tile>
        <Tile label="Status">
          <DashBadge variant={STATUS_VARIANT[status] ?? "neutral"}>{status}</DashBadge>
        </Tile>
        <Tile label="Open tasks" value={String(open)} sub={`${total} total`} />
        <Tile
          label="Overdue"
          value={String(overdue)}
          tone={overdue > 0 ? "red" : undefined}
          sub={overdue === 0 ? "on track" : "needs attention"}
        />
        <Tile label="Completed" value={`${done}/${total}`} sub={`${progressPct}%`} />
        <Tile label="Contacts" value={String(contacts)} />
        <Tile label="Touches" value={String(touchCount)} />
        <Tile label="Stage" value={stageName ?? "—"} />
        <Tile label="Due" value={dueDate ? formatDate(dueDate) : "—"} />
        <Tile label="Last update" value={formatRelative(updatedAt)} />
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-tiny text-text-tertiary">
          <span>Milestone progress</span>
          <span className="tabular-nums">
            {done}/{total} · {progressPct}%
          </span>
        </div>
        <ProgressBar pct={progressPct} fillClass="bg-green-mid" />
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
  children,
}: {
  label: string;
  value?: string;
  sub?: string;
  tone?: "red";
  children?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg border bg-card px-3 py-2.5"
      style={{ borderColor: "var(--border-default)" }}
    >
      <div className="text-tiny uppercase tracking-wide text-text-tertiary">{label}</div>
      <div className="mt-1.5 flex min-h-[22px] items-center">
        {children ?? (
          <span
            className={
              tone === "red"
                ? "text-[18px] font-medium tabular-nums text-red-text"
                : "text-[18px] font-medium tabular-nums text-text-primary"
            }
          >
            {value}
          </span>
        )}
      </div>
      {sub && <div className="mt-0.5 text-tiny text-text-tertiary">{sub}</div>}
    </div>
  );
}
