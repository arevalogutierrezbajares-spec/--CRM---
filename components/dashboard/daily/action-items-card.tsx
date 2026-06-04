"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ListTodo, Mic, Plus } from "lucide-react";
import { toast } from "sonner";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { DashBadge, type BadgeVariant } from "../shared/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { setActionItemDone } from "@/app/(app)/action-items/actions";
import { createActionItemAction } from "@/app/(app)/dashboard/item-actions";
import { useItemDrawer } from "../item-drawer";
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
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ActionItemsCard({ items }: { items: DashActionItem[] }) {
  const router = useRouter();
  const drawer = useItemDrawer();
  const [pending, startTransition] = useTransition();
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Set<string>>(new Set());

  function complete(item: DashActionItem) {
    setRemoving((s) => new Set(s).add(item.id)); // optimistic collapse
    startTransition(async () => {
      const res = await setActionItemDone({ id: item.id, done: true });
      if (res.ok) {
        toast.success("Done ✓", { duration: 1200 });
        router.refresh();
      } else {
        toast.error(res.error);
        setRemoving((s) => {
          const n = new Set(s);
          n.delete(item.id);
          return n;
        });
      }
    });
  }

  async function quickAdd() {
    if (!newTitle.trim()) return;
    setAdding(true);
    const res = await createActionItemAction({ title: newTitle });
    setAdding(false);
    if (res.ok) {
      setNewTitle("");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <DashCard>
      <div className="flex items-center justify-between">
        <SectionLabel icon={ListTodo}>Action items</SectionLabel>
        {items.length > 0 && (
          <span className="text-tiny text-text-tertiary tabular-nums">{items.length} open</span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-5 text-center">
          <CheckCircle2 size={20} className="text-green-mid" />
          <p className="text-[12px] text-text-secondary">No open action items.</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          <AnimatePresence initial={false}>
            {items.slice(0, 8).filter((item) => !removing.has(item.id)).map((item) => {
              const badge = item.isOverdue
                ? { label: "Overdue", variant: "red" as BadgeVariant }
                : item.priority
                  ? PRIORITY_BADGE[item.priority]
                  : null;
              return (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0, x: 12 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-start gap-2 group overflow-hidden rounded px-1 py-1 hover:bg-surface"
                >
                  <input
                    type="checkbox"
                    aria-label={`Complete ${item.title}`}
                    disabled={pending}
                    onChange={() => complete(item)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-green-mid"
                  />
                  <button
                    type="button"
                    onClick={() => drawer?.openItem("action_item", item.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-1 text-[12.5px] text-text-primary">
                      <span className="truncate">{item.title}</span>
                      {item.fromVoice && <Mic size={10} className="shrink-0 text-text-tertiary" aria-label="From voice note" />}
                    </div>
                    {item.dueDate && <div className="text-tiny text-text-tertiary">due {shortDate(item.dueDate)}</div>}
                  </button>
                  {badge && <DashBadge variant={badge.variant}>{badge.label}</DashBadge>}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      <div className="mt-2 flex items-center gap-1.5">
        <Plus size={13} className="shrink-0 text-text-tertiary" />
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void quickAdd();
            }
          }}
          placeholder="Add an action item…"
          className="h-7 border-0 bg-transparent px-0 text-[12.5px] focus-visible:ring-0"
        />
        {newTitle.trim() && (
          <Button type="button" size="sm" variant="ghost" onClick={quickAdd} loading={adding}>Add</Button>
        )}
      </div>

      {items.length > 8 && <p className="mt-1 text-tiny text-text-tertiary">+{items.length - 8} more</p>}
    </DashCard>
  );
}
