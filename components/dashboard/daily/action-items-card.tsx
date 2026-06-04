"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ListTodo, Mic } from "lucide-react";
import { toast } from "sonner";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { DashBadge, type BadgeVariant } from "../shared/badge";
import { setActionItemDone } from "@/app/(app)/action-items/actions";
import type { DashActionItem } from "@/db/queries/dashboard";

const PRIORITY_BADGE: Record<
  NonNullable<DashActionItem["priority"]>,
  { label: string; variant: BadgeVariant }
> = {
  now: { label: "Now", variant: "red" },
  next: { label: "Next", variant: "amber" },
  later: { label: "Later", variant: "blue" },
  backlog: { label: "Backlog", variant: "neutral" },
};

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function ActionItemsCard({ items }: { items: DashActionItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function complete(item: DashActionItem) {
    startTransition(async () => {
      const res = await setActionItemDone({ id: item.id, done: true });
      if (res.ok) {
        toast.success("Done");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <DashCard>
      <div className="flex items-center justify-between">
        <SectionLabel icon={ListTodo}>Action items</SectionLabel>
        {items.length > 0 && (
          <span className="text-tiny text-text-tertiary tabular-nums">
            {items.length} open
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-6 text-center">
          <CheckCircle2 size={20} className="text-green-mid" />
          <p className="text-[12px] text-text-secondary">
            No open action items.
          </p>
          <p className="text-tiny text-text-tertiary">
            Send a voice note to your assistant on WhatsApp to capture some.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.slice(0, 8).map((item) => {
            const badge = item.isOverdue
              ? { label: "Overdue", variant: "red" as BadgeVariant }
              : item.priority
                ? PRIORITY_BADGE[item.priority]
                : null;
            return (
              <li
                key={item.id}
                className="flex items-start gap-2 group rounded px-1 py-1 hover:bg-surface transition-colors"
              >
                <input
                  type="checkbox"
                  aria-label={`Complete ${item.title}`}
                  disabled={pending}
                  onChange={() => complete(item)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-green-mid"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-[12.5px] text-text-primary">
                    <span className="truncate">{item.title}</span>
                    {item.fromVoice && (
                      <Mic
                        size={10}
                        className="shrink-0 text-text-tertiary"
                        aria-label="From voice note"
                      />
                    )}
                  </div>
                  {item.dueDate && (
                    <div className="text-tiny text-text-tertiary">
                      due {shortDate(item.dueDate)}
                    </div>
                  )}
                </div>
                {badge && <DashBadge variant={badge.variant}>{badge.label}</DashBadge>}
              </li>
            );
          })}
        </ul>
      )}

      {items.length > 8 && (
        <p className="mt-2 text-tiny text-text-tertiary">+{items.length - 8} more</p>
      )}
    </DashCard>
  );
}
