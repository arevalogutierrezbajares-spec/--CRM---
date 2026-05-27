import Link from "next/link";
import type { OverlordActivityEvent } from "@/db/queries/overlord";

interface ActivityFeedProps {
  events: OverlordActivityEvent[];
}

function formatTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActivityFeed({ events }: ActivityFeedProps) {
  if (events.length === 0) {
    return (
      <p className="text-[12px] text-text-secondary py-3">
        No agent activity recorded yet. Sync Overlord to ingest history.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {events.map((e, i) => (
        <li
          key={`${e.taskKey}-${i}`}
          className="flex gap-2 border-b pb-2"
          style={{ borderColor: "var(--border-default)" }}
        >
          <div className="flex flex-col items-end shrink-0 w-[100px]">
            <span className="text-tiny text-text-tertiary tabular-nums">
              {formatTs(e.ts)}
            </span>
            <span className="text-tiny text-purple-text font-medium">
              {e.agent}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <Link
              href={`/overlord/${encodeURIComponent(e.taskKey)}`}
              className="text-tiny text-text-secondary font-mono hover:text-text-primary"
            >
              {e.taskKey}
            </Link>
            <div className="text-[12px] text-text-primary line-clamp-2">
              {e.note}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
