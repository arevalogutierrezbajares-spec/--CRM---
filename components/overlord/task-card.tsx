import Link from "next/link";
import { Clock, User, GitBranch } from "lucide-react";
import {
  OverlordPriorityBadge,
  OverlordStatusBadge,
} from "./status-badge";
import type { OverlordTaskWithSection } from "@/db/queries/overlord";

interface TaskCardProps {
  task: OverlordTaskWithSection;
}

function formatHeartbeatAge(ts: Date | null): string | null {
  if (!ts) return null;
  const ms = Date.now() - new Date(ts).getTime();
  if (ms < 60_000) return "active now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

function acProgress(criteria: unknown): { done: number; total: number } | null {
  const arr = criteria as Array<{ done: boolean }> | null;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return { done: arr.filter((c) => c.done).length, total: arr.length };
}

export function OverlordTaskCard({ task }: TaskCardProps) {
  const ac = acProgress(task.acceptanceCriteria);
  const heartbeat = formatHeartbeatAge(task.lastHeartbeat);

  return (
    <Link
      href={`/overlord/${encodeURIComponent(task.taskKey)}`}
      className="block rounded-md border bg-card p-2.5 hover:bg-surface transition-colors"
      style={{ borderColor: "var(--border-default)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-tiny text-text-tertiary font-mono">
          {task.taskKey}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <OverlordPriorityBadge priority={task.priority} />
          <OverlordStatusBadge status={task.status} />
        </div>
      </div>
      <div className="text-[12.5px] text-text-primary mt-1 line-clamp-2">
        {task.title}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-tiny text-text-tertiary">
        {task.claimedByAgent && (
          <span className="flex items-center gap-1">
            <User size={10} /> {task.claimedByAgent}
            {heartbeat && task.status === "in_progress" && (
              <span className="text-green-text"> · {heartbeat}</span>
            )}
          </span>
        )}
        {task.branch && (
          <span className="flex items-center gap-1 font-mono truncate max-w-[160px]" title={task.branch}>
            <GitBranch size={10} /> {task.branch.replace(/^feature\//, "")}
          </span>
        )}
        {ac && (
          <span className="flex items-center gap-1">
            ☑ {ac.done}/{ac.total}
          </span>
        )}
        {task.lastModifiedDate && (
          <span className="flex items-center gap-1">
            <Clock size={10} /> {task.lastModifiedDate}
          </span>
        )}
      </div>
    </Link>
  );
}
