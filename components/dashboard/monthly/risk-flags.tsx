import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { DashBadge } from "../shared/badge";
import type { BlockedProject, DueItem } from "@/db/queries/this-week";

interface RiskFlagsProps {
  blocked: BlockedProject[];
  overdueTasks: DueItem[];
}

export function RiskFlags({ blocked, overdueTasks }: RiskFlagsProps) {
  const overdueBlocked = blocked.filter((b) => b.isOverdue);
  const flags = [
    ...overdueBlocked.map((b) => ({
      key: `b-${b.id}`,
      severity: "high" as const,
      title: b.title,
      detail: `Waiting on ${b.waitingOn}`,
      href: `/projects/${b.id}`,
    })),
    ...overdueTasks.slice(0, 5).map((t) => ({
      key: `t-${t.milestoneId}`,
      severity: "medium" as const,
      title: t.title,
      detail: `${t.projectTitle} · overdue`,
      href: `/projects/${t.projectId}`,
    })),
    ...blocked
      .filter((b) => !b.isOverdue)
      .slice(0, 5)
      .map((b) => ({
        key: `bw-${b.id}`,
        severity: "watch" as const,
        title: b.title,
        detail: `Blocked · ${b.waitingOn}`,
        href: `/projects/${b.id}`,
      })),
  ];

  return (
    <DashCard>
      <SectionLabel icon={AlertTriangle}>Risk flags</SectionLabel>
      {flags.length === 0 ? (
        <p className="py-3 text-[12px] text-text-secondary">No risks to flag.</p>
      ) : (
        <ul className="space-y-1.5">
          {flags.slice(0, 6).map((f) => (
            <li
              key={f.key}
              className="flex items-start justify-between gap-2 rounded px-1 py-1"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={f.href}
                  className="block text-[12px] font-medium text-text-primary truncate hover:underline"
                >
                  {f.title}
                </Link>
                <div className="text-tiny text-text-tertiary truncate">
                  {f.detail}
                </div>
              </div>
              <DashBadge
                variant={
                  f.severity === "high"
                    ? "red"
                    : f.severity === "medium"
                      ? "amber"
                      : "blue"
                }
              >
                {f.severity}
              </DashBadge>
            </li>
          ))}
        </ul>
      )}
    </DashCard>
  );
}
