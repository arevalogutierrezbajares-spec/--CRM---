import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "blue"
  | "green"
  | "amber"
  | "red"
  | "purple"
  | "teal"
  | "neutral";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  blue: "bg-blue-bg text-blue-text",
  green: "bg-green-bg text-green-text",
  amber: "bg-amber-bg text-amber-text",
  red: "bg-red-bg text-red-text",
  purple: "bg-purple-bg text-purple-text",
  teal: "bg-teal-bg text-teal-text",
  neutral: "bg-surface text-text-secondary",
};

interface DashBadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}

export function DashBadge({
  variant = "neutral",
  className,
  children,
}: DashBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium leading-tight whitespace-nowrap",
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
