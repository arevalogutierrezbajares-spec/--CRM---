import { DashBadge, type BadgeVariant } from "@/components/dashboard/shared/badge";

const PRIORITY_VARIANT: Record<string, BadgeVariant> = {
  now: "red",
  next: "amber",
  later: "blue",
  backlog: "neutral",
};

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  pending: "neutral",
  in_progress: "blue",
  in_review: "purple",
  blocked: "amber",
  done: "green",
  cancelled: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "todo",
  in_progress: "in progress",
  in_review: "in review",
  blocked: "blocked",
  done: "done",
  cancelled: "cancelled",
};

export function WorkPriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return null;
  return (
    <DashBadge variant={PRIORITY_VARIANT[priority] ?? "neutral"}>
      {priority}
    </DashBadge>
  );
}

export function WorkStatusBadge({ status }: { status: string }) {
  return (
    <DashBadge variant={STATUS_VARIANT[status] ?? "neutral"}>
      {STATUS_LABEL[status] ?? status}
    </DashBadge>
  );
}

const INITIATIVE_STATUS_VARIANT: Record<string, BadgeVariant> = {
  planning: "neutral",
  active: "blue",
  paused: "amber",
  done: "green",
  cancelled: "neutral",
};

export function InitiativeStatusBadge({ status }: { status: string }) {
  return (
    <DashBadge variant={INITIATIVE_STATUS_VARIANT[status] ?? "neutral"}>
      {status}
    </DashBadge>
  );
}

const SPRINT_STATUS_VARIANT: Record<string, BadgeVariant> = {
  planned: "neutral",
  active: "blue",
  completed: "green",
};

export function SprintStatusBadge({ status }: { status: string }) {
  return (
    <DashBadge variant={SPRINT_STATUS_VARIANT[status] ?? "neutral"}>
      {status}
    </DashBadge>
  );
}
