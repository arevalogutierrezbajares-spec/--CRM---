import { cn } from "@/lib/utils";

interface DashCardProps {
  className?: string;
  children: React.ReactNode;
}

/** Spec card shell: white card, hair border, 12px padding, 12px radius. */
export function DashCard({ className, children }: DashCardProps) {
  return (
    <div
      className={cn("bg-card border rounded-lg p-3", className)}
      style={{ borderColor: "var(--border-default)" }}
    >
      {children}
    </div>
  );
}
