import { AlertCircle, Check, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Health = "green" | "amber" | "red";

const variantByHealth: Record<Health, "success" | "warning" | "danger"> = {
  green: "success",
  amber: "warning",
  red: "danger",
};

const iconByHealth: Record<Health, React.ComponentType<{ className?: string }>> =
  {
    green: Check,
    amber: Clock,
    red: AlertCircle,
  };

const labelByHealth: Record<Health, string> = {
  green: "On track",
  amber: "Watch",
  red: "At risk",
};

/**
 * Color + icon + label — accessible health badge.
 * Lets users distinguish by shape, not just hue (a11y D4).
 */
export function HealthBadge({
  health,
  short = false,
  className,
}: {
  health: Health;
  short?: boolean;
  className?: string;
}) {
  const Icon = iconByHealth[health];
  return (
    <Badge variant={variantByHealth[health]} className={cn("gap-1", className)}>
      <Icon className="h-3 w-3" />
      {short ? health : labelByHealth[health]}
    </Badge>
  );
}
