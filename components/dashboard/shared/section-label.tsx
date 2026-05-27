import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface SectionLabelProps {
  icon?: LucideIcon;
  className?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}

export function SectionLabel({
  icon: Icon,
  className,
  children,
  right,
}: SectionLabelProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-1.5 mb-2.5",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-label text-text-secondary">
        {Icon && <Icon size={14} />}
        <span>{children}</span>
      </div>
      {right}
    </div>
  );
}
