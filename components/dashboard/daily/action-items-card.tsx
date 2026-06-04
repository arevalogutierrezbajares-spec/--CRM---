"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Clock, ListTodo, Mic, Plus } from "lucide-react";
import { toast } from "sonner";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { DashBadge, type BadgeVariant } from "../shared/badge";
import { Button } from "@/components/ui/button";
import { MentionInput, type MentionSources } from "@/components/ui/mention-input";
import { CaptureChips, useCapturePicks } from "./capture-chips";
import { useOptimisticList } from "@/lib/use-optimistic-list";
import { parseCapture } from "@/lib/nlp/parse-capture";
import { setActionItemDone } from "@/app/(app)/action-items/actions";
import { captureItemAction, snoozeActionItemAction } from "@/app/(app)/dashboard/item-actions";
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

export function ActionItemsCard({ items, sources }: { items: DashActionItem[]; sources: MentionSources }) {
  const router = useRouter();
  const drawer = useItemDrawer();
  const [pending, startTransition] = useTransition();
  const [newTitle, setNewTitle] = useState("");
  // Optimistic list: mutations apply instantly and reconcile when the server
  // action's revalidatePath streams new props (rolls back if it doesn't).
  const [optimistic, dispatch] = useOptimisticList(items);
  const listRef = useRef<HTMLUListElement>(null);
  // Combobox picks (first @person = owner, all = notified) reconciled to the text.
  const picks = useCapturePicks();

  // "Fire a queue": after clearing an item, move focus to the next item's
  // checkbox (by id — the removed row lingers during its exit animation, so we
  // target the surviving element explicitly). Lets you Space → Space → Space.
  function focusNextAfter(itemId: string) {
    const visible = optimistic.slice(0, 8);
    const idx = visible.findIndex((x) => x.id === itemId);
    const nextId = visible[idx + 1]?.id ?? visible[idx - 1]?.id ?? null;
    if (!nextId) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        listRef.current?.querySelector<HTMLInputElement>(`input[data-item-id="${nextId}"]`)?.focus();
      }),
    );
  }

  // Pattern: dispatch the optimistic change (instant), run the action, then
  // refresh INSIDE the transition so the server reconciliation is masked by the
  // optimistic state (no flash, no wait). On error we skip refresh → the
  // optimistic change reverts when the transition ends.
  function complete(item: DashActionItem) {
    focusNextAfter(item.id);
    startTransition(async () => {
      dispatch({ kind: "remove", id: item.id }); // instant collapse
      const res = await setActionItemDone({ id: item.id, done: true });
      if (res.ok) {
        toast.success("Done ✓", { duration: 1200 });
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function snooze(item: DashActionItem, days: number) {
    focusNextAfter(item.id);
    startTransition(async () => {
      dispatch({ kind: "remove", id: item.id });
      const res = await snoozeActionItemAction({ id: item.id, days });
      if (res.ok) {
        toast.success(days === 1 ? "Snoozed to tomorrow" : `Snoozed ${days} days`, { duration: 1400 });
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function quickAdd() {
    if (!newTitle.trim()) return;
    const raw = newTitle;
    const r = picks.reconcile(raw); // drop picks whose token was deleted
    // @all is a broadcast — confirm the blast radius (Slack-style friction).
    if (r.notifyAll && !confirm("Notify the whole team about this?")) return;
    const parsed = parseCapture(raw);
    setNewTitle(""); // clear instantly — the input is the source of double-submit
    picks.reset();
    startTransition(async () => {
      dispatch({
        kind: "add",
        prepend: true,
        item: {
          id: `tmp-${crypto.randomUUID()}`,
          title: parsed.title || raw.trim(),
          dueDate: parsed.dueDate,
          priority: parsed.priority,
          fromVoice: false,
          createdAt: new Date(),
          isOverdue: false,
        },
      });
      const res = await captureItemAction({
        rawText: raw,
        itemKind: "action_item",
        assigneeUserId: r.assigneeUserId,
        mentionUserIds: r.mentionUserIds,
        projectId: r.projectId,
        docRefs: r.docRefs,
        notifyAll: r.notifyAll,
        dueDate: parsed.dueDate, // client-resolved (tz-correct)
      });
      if (res.ok) {
        toast.success(res.summary, { duration: 1800 });
        router.refresh(); // reconcile the temp row → the real persisted one
      } else toast.error(res.error);
    });
  }

  return (
    <DashCard>
      <div className="flex items-center justify-between">
        <SectionLabel icon={ListTodo}>Action items</SectionLabel>
        {optimistic.length > 0 && (
          <span className="text-tiny text-text-tertiary tabular-nums">{optimistic.length} open</span>
        )}
      </div>

      {optimistic.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-5 text-center">
          <CheckCircle2 size={20} className="text-green-mid" />
          <p className="text-[12px] text-text-secondary">No open action items.</p>
        </div>
      ) : (
        <ul ref={listRef} className="space-y-1.5">
          <AnimatePresence initial={false}>
            {optimistic.slice(0, 8).map((item) => {
              const badge = item.isOverdue
                ? { label: "Overdue", variant: "red" as BadgeVariant }
                : item.priority
                  ? PRIORITY_BADGE[item.priority]
                  : null;
              // A just-added optimistic row has no real server id yet — keep it
              // non-interactive until the persisted row reconciles in.
              const isTemp = item.id.startsWith("tmp-");
              return (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0, x: 12 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className={`flex items-start gap-2 group overflow-hidden rounded px-1 py-1 hover:bg-surface ${isTemp ? "opacity-60" : ""}`}
                >
                  <input
                    type="checkbox"
                    data-item-id={item.id}
                    aria-label={`Complete ${item.title}`}
                    disabled={isTemp}
                    onChange={() => complete(item)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-green-mid disabled:cursor-default"
                  />
                  <button
                    type="button"
                    disabled={isTemp}
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
                  <button
                    type="button"
                    onClick={() => snooze(item, 7)}
                    disabled={isTemp}
                    title="Snooze 1 week"
                    aria-label={`Snooze ${item.title} 1 week`}
                    className="shrink-0 rounded p-0.5 text-text-tertiary opacity-0 transition-opacity hover:text-[var(--blue-text)] focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <Clock size={13} />
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      <div className="mt-2 flex items-center gap-1.5">
        <Plus size={13} className="shrink-0 text-text-tertiary" />
        <MentionInput
          value={newTitle}
          onChange={setNewTitle}
          onPick={picks.onPick}
          onSubmit={quickAdd}
          sources={sources}
          aria-label="Add an action item"
          placeholder="Add a to-do… @assign  #project  @doc"
          className="flex-1"
          inputClassName="h-7 w-full border-0 bg-transparent px-0 text-[12.5px] outline-none placeholder:text-text-tertiary"
        />
        {newTitle.trim() && (
          <Button type="button" size="sm" variant="ghost" onClick={quickAdd} loading={pending}>Add</Button>
        )}
      </div>
      <CaptureChips picks={picks} text={newTitle} />

      {optimistic.length > 8 && <p className="mt-1 text-tiny text-text-tertiary">+{optimistic.length - 8} more</p>}
    </DashCard>
  );
}
