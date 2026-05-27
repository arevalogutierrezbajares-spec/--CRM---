import { DashBadge, type BadgeVariant } from "@/components/dashboard/shared/badge";

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  todo: "neutral",
  in_progress: "blue",
  in_review: "purple",
  blocked: "amber",
  completed: "green",
  cancelled: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  todo: "todo",
  in_progress: "in progress",
  in_review: "in review",
  blocked: "blocked",
  completed: "done",
  cancelled: "cancelled",
};

const PRIORITY_VARIANT: Record<string, BadgeVariant> = {
  NOW: "red",
  NEXT: "amber",
  LATER: "blue",
  BACKLOG: "neutral",
};

export function OverlordStatusBadge({ status }: { status: string }) {
  return (
    <DashBadge variant={STATUS_VARIANT[status] ?? "neutral"}>
      {STATUS_LABEL[status] ?? status}
    </DashBadge>
  );
}

export function OverlordPriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return null;
  return (
    <DashBadge variant={PRIORITY_VARIANT[priority] ?? "neutral"}>
      {priority}
    </DashBadge>
  );
}
