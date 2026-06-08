"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { advanceProjectStage } from "@/app/(app)/projects/actions";

type Card = {
  id: string;
  title: string;
  status: "active" | "waiting" | "done" | "lost";
  health: "green" | "amber" | "red";
  openMilestones: number;
  overdueMilestones: number;
  waitingOn: string | null;
};

const healthDot: Record<Card["health"], string> = {
  green: "bg-[var(--health-green)]",
  amber: "bg-[var(--health-amber)]",
  red: "bg-[var(--health-red)]",
};

export function KanbanCard({
  card,
  prevStageId,
  nextStageId,
}: {
  card: Card;
  prevStageId: string | null;
  nextStageId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function move(stageId: string) {
    startTransition(async () => {
      const res = await advanceProjectStage({
        projectId: card.id,
        toStageId: stageId,
      });
      if (res.ok) toast.success(`Moved "${card.title}"`);
      else toast.error(res.error);
      router.refresh();
    });
  }

  return (
    <div className="group rounded-md border border-[var(--border)] bg-[var(--card)] p-3 text-sm shadow-sm">
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", healthDot[card.health])}
        />
        <Link
          href={`/projects/${card.id}`}
          className="min-w-0 flex-1 font-medium hover:underline"
        >
          {card.title}
        </Link>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        {card.status !== "active" && (
          <Badge
            variant={
              card.status === "done"
                ? "success"
                : card.status === "waiting"
                  ? "warning"
                  : "danger"
            }
          >
            {card.status}
          </Badge>
        )}
        {card.openMilestones > 0 && (
          <span className="text-[var(--muted-foreground)]">
            {card.openMilestones} open
          </span>
        )}
        {card.overdueMilestones > 0 && (
          <span className="text-[var(--health-red)]">
            {card.overdueMilestones} overdue
          </span>
        )}
      </div>

      {card.waitingOn && (
        <p className="mt-1.5 text-xs text-[var(--health-amber)]">
          waiting: {card.waitingOn}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-1 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Move "${card.title}" back one stage`}
          disabled={!prevStageId || pending}
          onClick={() => prevStageId && move(prevStageId)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Advance "${card.title}" to next stage`}
          disabled={!nextStageId || pending}
          onClick={() => nextStageId && move(nextStageId)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
