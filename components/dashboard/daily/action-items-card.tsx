"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, CheckSquare, Clock, Copy, GripVertical, ListTodo, Mic, Plus, Square } from "lucide-react";
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

function actionItemText(item: DashActionItem): string {
  const meta = [
    item.dueDate ? `due ${shortDate(item.dueDate)}` : null,
    item.priority ? PRIORITY_BADGE[item.priority].label.toLowerCase() : null,
    item.fromVoice ? "voice" : null,
  ].filter(Boolean);
  return `- [ ] ${item.title}${meta.length ? ` — ${meta.join(" · ")}` : ""}`;
}

function textBlock(items: DashActionItem[]): string {
  return items.map(actionItemText).join("\n");
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to textarea fallback */
  }

  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    el.style.top = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export function ActionItemsCard({ items, sources }: { items: DashActionItem[]; sources: MentionSources }) {
  const router = useRouter();
  const drawer = useItemDrawer();
  const [pending, startTransition] = useTransition();
  const [newTitle, setNewTitle] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  // Optimistic list: mutations apply instantly and reconcile when the server
  // action's revalidatePath streams new props (rolls back if it doesn't).
  const [optimistic, dispatch] = useOptimisticList(items);
  const listRef = useRef<HTMLUListElement>(null);
  const lastSelectedRef = useRef<string | null>(null);
  // Combobox picks (first @person = owner, all = notified) reconciled to the text.
  const picks = useCapturePicks();

  const visibleIds = optimistic.filter((item) => !item.id.startsWith("tmp-")).map((item) => item.id);
  const selectedItems = optimistic.filter((item) => selectedIds.has(item.id) && !item.id.startsWith("tmp-"));
  const allVisibleSelected = visibleIds.length > 0 && selectedItems.length === visibleIds.length;

  // "Fire a queue": after clearing an item, move focus to the next item's
  // checkbox (by id — the removed row lingers during its exit animation, so we
  // target the surviving element explicitly). Lets you Space → Space → Space.
  function focusNextAfter(itemId: string) {
    const visible = optimistic;
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

  function toggleSelecting() {
    if (selecting) {
      setSelectedIds(new Set());
      lastSelectedRef.current = null;
    }
    setSelecting((v) => !v);
  }

  function toggleSelected(item: DashActionItem, checked: boolean, shiftKey = false) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedRef.current) {
        const from = visibleIds.indexOf(lastSelectedRef.current);
        const to = visibleIds.indexOf(item.id);
        if (from >= 0 && to >= 0) {
          const [a, b] = from < to ? [from, to] : [to, from];
          for (const id of visibleIds.slice(a, b + 1)) {
            if (checked) next.add(id);
            else next.delete(id);
          }
        } else if (checked) {
          next.add(item.id);
        } else {
          next.delete(item.id);
        }
      } else if (checked) {
        next.add(item.id);
      } else {
        next.delete(item.id);
      }
      return next;
    });
    lastSelectedRef.current = item.id;
  }

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  async function copySelected() {
    if (selectedItems.length === 0) {
      toast.error("Select action items first");
      return;
    }
    const ok = await writeClipboard(textBlock(selectedItems));
    if (ok) toast.success(`${selectedItems.length} action item${selectedItems.length === 1 ? "" : "s"} copied`);
    else toast.error("Could not copy to clipboard");
  }

  function dragSelected(e: React.DragEvent<HTMLElement>) {
    if (selectedItems.length === 0) return;
    const text = textBlock(selectedItems);
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", text);
    e.dataTransfer.setData("text/markdown", text);
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
        <div className="flex items-center gap-2">
          {optimistic.length > 0 && (
            <span className="text-tiny text-text-tertiary tabular-nums">{optimistic.length} open</span>
          )}
          {optimistic.length > 0 && (
            <button
              type="button"
              onClick={toggleSelecting}
              aria-pressed={selecting}
              className="inline-flex h-[40px] items-center gap-1.5 rounded-md px-2 text-tiny text-text-tertiary transition-colors hover:bg-surface hover:text-text-primary active:scale-[0.96]"
            >
              {selecting ? <CheckSquare size={13} /> : <Square size={13} />}
              Select
            </button>
          )}
        </div>
      </div>

      {selecting && optimistic.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-surface/55 px-2 py-1.5">
          <button
            type="button"
            onClick={toggleAllVisible}
            className="inline-flex h-[40px] items-center gap-1.5 rounded-md px-2 text-tiny text-text-secondary transition-colors hover:bg-card hover:text-text-primary active:scale-[0.96]"
          >
            {allVisibleSelected ? <CheckSquare size={13} /> : <Square size={13} />}
            {allVisibleSelected ? "Selected all" : "Select all"}
          </button>
          <button
            type="button"
            onClick={copySelected}
            disabled={selectedItems.length === 0}
            className="inline-flex h-[40px] items-center gap-1.5 rounded-md px-2 text-tiny text-text-secondary transition-colors hover:bg-card hover:text-text-primary active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Copy size={13} />
            Copy text
          </button>
          <button
            type="button"
            draggable={selectedItems.length > 0}
            onDragStart={dragSelected}
            disabled={selectedItems.length === 0}
            title="Drag selected action items into any text field"
            className="inline-flex h-[40px] cursor-grab items-center gap-1.5 rounded-md px-2 text-tiny text-text-secondary transition-colors hover:bg-card hover:text-text-primary active:cursor-grabbing active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <GripVertical size={13} />
            Drag text
          </button>
          <span className="ml-auto text-tiny text-text-tertiary tabular-nums">
            {selectedItems.length}/{visibleIds.length} selected
          </span>
        </div>
      )}

      {optimistic.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-5 text-center">
          <CheckCircle2 size={20} className="text-green-mid" />
          <p className="text-[12px] text-text-secondary">No open action items.</p>
        </div>
      ) : (
        <ul ref={listRef} className="max-h-[360px] space-y-1 overflow-y-auto pr-0.5">
          <AnimatePresence initial={false}>
            {optimistic.map((item) => {
              const badge = item.isOverdue
                ? { label: "Overdue", variant: "red" as BadgeVariant }
                : item.priority
                  ? PRIORITY_BADGE[item.priority]
                  : null;
              // A just-added optimistic row has no real server id yet — keep it
              // non-interactive until the persisted row reconciles in.
              const isTemp = item.id.startsWith("tmp-");
              const isSelected = selectedIds.has(item.id);
              return (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0, x: 12 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className={`group flex min-h-[44px] items-start gap-2 overflow-hidden rounded-md px-2 py-1.5 transition-colors hover:bg-surface ${
                    isSelected ? "bg-[var(--blue-soft)] outline outline-1 outline-[var(--blue-text)]" : ""
                  } ${isTemp ? "opacity-60" : ""}`}
                >
                  <label className="grid h-[40px] w-[40px] shrink-0 cursor-pointer place-items-start pt-1.5">
                    <input
                      type="checkbox"
                      data-item-id={item.id}
                      aria-label={`Complete ${item.title}`}
                      disabled={isTemp}
                      onChange={() => complete(item)}
                      className="h-4 w-4 cursor-pointer accent-green-mid disabled:cursor-default"
                    />
                  </label>
                  {selecting && (
                    <label className="grid h-[40px] w-[40px] shrink-0 cursor-pointer place-items-start pt-1.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${item.title}`}
                        disabled={isTemp}
                        checked={isSelected}
                        onChange={(e) =>
                          toggleSelected(item, e.currentTarget.checked, (e.nativeEvent as MouseEvent).shiftKey)
                        }
                        className="h-4 w-4 cursor-pointer accent-[var(--blue-text)] disabled:cursor-default"
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    disabled={isTemp}
                    onClick={(e) => {
                      if (selecting) toggleSelected(item, !isSelected, e.shiftKey);
                      else drawer?.openItem("action_item", item.id);
                    }}
                    className="flex min-w-0 flex-1 flex-col justify-center self-stretch rounded-sm text-left outline-none transition-transform active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    <div className="flex items-start gap-1 text-[12.5px] leading-snug text-text-primary">
                      <span className="break-words">{item.title}</span>
                      {item.fromVoice && <Mic size={10} className="mt-0.5 shrink-0 text-text-tertiary" aria-label="From voice note" />}
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
                    className="grid h-[40px] w-[40px] shrink-0 place-items-center rounded-md text-text-tertiary opacity-0 transition-opacity hover:text-[var(--blue-text)] focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <Clock size={13} />
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Plus size={13} className="shrink-0 text-text-tertiary" />
        <MentionInput
          value={newTitle}
          onChange={setNewTitle}
          onPick={picks.onPick}
          onSubmit={quickAdd}
          sources={sources}
          aria-label="Add an action item"
          placeholder="Add a to-do… @assign  #project  @doc"
          className="min-w-[140px] flex-1"
          inputClassName="h-[40px] w-full border-0 bg-transparent px-0 text-[12.5px] outline-none placeholder:text-text-tertiary"
        />
        {newTitle.trim() && (
          <Button type="button" size="sm" variant="ghost" onClick={quickAdd} loading={pending} className="h-[40px]">Add</Button>
        )}
      </div>
      <CaptureChips picks={picks} text={newTitle} />
    </DashCard>
  );
}
