import { cn } from "@/lib/utils";
import { DashBadge, type BadgeVariant } from "./badge";

export type AIActionPriority = "high" | "medium" | "low";
export type AIActionType = "risk" | "follow_up" | "opportunity";

export interface AIAction {
  id: string;
  priority: AIActionPriority;
  type: AIActionType;
  title: string;
  description: string;
  source?: string;
  sourceAgeHours?: number;
  account?: string;
  suggestedActions?: string[];
}

const TYPE_LABEL: Record<AIActionType, string> = {
  risk: "Risk",
  follow_up: "Follow-up",
  opportunity: "Opportunity",
};

const TYPE_BADGE: Record<AIActionType, BadgeVariant> = {
  risk: "red",
  follow_up: "amber",
  opportunity: "blue",
};

const TYPE_BORDER: Record<AIActionType, string> = {
  risk: "border-l-red-mid",
  follow_up: "border-l-amber-mid",
  opportunity: "border-l-blue-mid",
};

function formatAge(hours?: number): string | null {
  if (hours == null) return null;
  if (hours < 1) return "now";
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

interface AIInsightCardProps {
  action: AIAction;
  onAction?: (action: AIAction, button: string) => void;
}

export function AIInsightCard({ action, onAction }: AIInsightCardProps) {
  const age = formatAge(action.sourceAgeHours);

  return (
    <div
      className={cn(
        "p-2 bg-surface rounded-md border-l-[3px]",
        TYPE_BORDER[action.type],
      )}
    >
      <div className="flex justify-between items-start gap-2">
        <DashBadge variant={TYPE_BADGE[action.type]}>
          {TYPE_LABEL[action.type]}
        </DashBadge>
        <span className="text-tiny text-text-tertiary whitespace-nowrap">
          {[action.source, age].filter(Boolean).join(" · ")}
        </span>
      </div>

      {action.account && (
        <div className="text-tiny text-text-secondary mt-1">
          {action.account}
        </div>
      )}

      <div className="text-[12px] font-medium mt-1 text-text-primary">
        {action.title}
      </div>
      <div className="text-[11px] text-text-secondary mt-0.5 line-clamp-2">
        {action.description}
      </div>

      {action.suggestedActions && action.suggestedActions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {action.suggestedActions.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => onAction?.(action, label)}
              className="text-tiny px-2 py-0.5 rounded border bg-transparent text-text-secondary hover:bg-card hover:text-text-primary transition-colors"
              style={{ borderColor: "var(--border-default)" }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
