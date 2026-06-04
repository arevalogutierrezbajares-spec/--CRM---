"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Clock, Inbox as InboxIcon, CornerDownLeft } from "lucide-react";
import { markNotificationsReadAction, snoozeNotificationAction } from "@/app/(app)/town-hall/actions";
import type { NotificationView } from "@/db/queries/town-hall";

const VERB: Record<string, string> = {
  assigned: "assigned you",
  mention: "mentioned you",
  ping: "pinged you",
};
function headline(n: NotificationView): string {
  if (n.kind === "reminder") return "⏰ Reminder";
  return `${n.authorName ?? "Someone"} ${VERB[n.kind] ?? "mentioned you"}`;
}

type Entry = { key: string; latest: NotificationView; ids: string[]; count: number };

/** Snooze presets → a target Date computed client-side. */
function snoozeTargets(): { label: string; at: () => Date }[] {
  return [
    { label: "Tonight", at: () => { const d = new Date(); d.setHours(18, 0, 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1); return d; } },
    { label: "Tomorrow", at: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
    { label: "Next Monday", at: () => { const d = new Date(); const dow = d.getDay(); d.setDate(d.getDate() + ((8 - dow) % 7 || 7)); d.setHours(9, 0, 0, 0); return d; } },
    { label: "In a week", at: () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d; } },
  ];
}

/**
 * Keyboard-triaged notification inbox (Linear-style): j/k to move, Enter/o to
 * open, e to mark done, h to snooze. Notifications are grouped by the item they
 * concern so "Acme — 3 updates" is one row.
 */
export function InboxView({ initial }: { initial: NotificationView[] }) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationView[]>(initial);
  const [sel, setSel] = useState(0);
  const [snoozeFor, setSnoozeFor] = useState<string | null>(null);

  const entries = useMemo<Entry[]>(() => {
    const map = new Map<string, Entry>();
    for (const n of items) {
      const key = n.entityType && n.entityId ? `${n.entityType}:${n.entityId}` : `post:${n.postId ?? n.id}`;
      const e = map.get(key);
      if (e) {
        e.ids.push(n.id);
        e.count += 1;
      } else {
        map.set(key, { key, latest: n, ids: [n.id], count: 1 });
      }
    }
    return [...map.values()];
  }, [items]);

  const selIdx = Math.min(sel, entries.length - 1);

  const done = useCallback((e: Entry) => {
    setItems((prev) => prev.filter((n) => !e.ids.includes(n.id)));
    void markNotificationsReadAction(e.ids).catch(() => {});
  }, []);

  const open = useCallback(
    (e: Entry) => {
      void markNotificationsReadAction(e.ids).catch(() => {});
      router.push(e.latest.href);
    },
    [router],
  );

  const snooze = useCallback((e: Entry, at: Date) => {
    setItems((prev) => prev.filter((n) => !e.ids.includes(n.id)));
    setSnoozeFor(null);
    void Promise.all(e.ids.map((id) => snoozeNotificationAction(id, at.toISOString()))).catch(() => {});
    toast.success(`Snoozed until ${at.toLocaleDateString(undefined, { weekday: "short" })} ${at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`, { duration: 1600 });
  }, []);

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.defaultPrevented) return; // a global shortcut (e.g. a g-chord) already claimed it
      const t = ev.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const e = entries[selIdx];
      if (snoozeFor) {
        if (ev.key === "Escape") setSnoozeFor(null);
        return;
      }
      if (ev.key === "j" || ev.key === "ArrowDown") { ev.preventDefault(); setSel((s) => Math.min(s + 1, entries.length - 1)); }
      else if (ev.key === "k" || ev.key === "ArrowUp") { ev.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
      else if ((ev.key === "Enter" || ev.key === "o") && e) { ev.preventDefault(); open(e); }
      else if ((ev.key === "e" || ev.key === "d") && e) { ev.preventDefault(); done(e); }
      else if (ev.key === "h" && e) { ev.preventDefault(); setSnoozeFor(e.key); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entries, selIdx, snoozeFor, open, done]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-center">
        <InboxIcon size={28} className="text-green-mid" />
        <p className="text-[14px] font-medium text-text-primary">Inbox zero 🎉</p>
        <p className="text-[12.5px] text-text-secondary">Nothing needs you right now.</p>
      </div>
    );
  }

  const targets = snoozeTargets();
  return (
    <div>
      <p className="mb-3 text-tiny text-text-tertiary">
        <kbd className="rounded bg-surface px-1 py-0.5 font-mono">j</kbd>/<kbd className="rounded bg-surface px-1 py-0.5 font-mono">k</kbd> move ·{" "}
        <kbd className="rounded bg-surface px-1 py-0.5 font-mono">↵</kbd> open ·{" "}
        <kbd className="rounded bg-surface px-1 py-0.5 font-mono">e</kbd> done ·{" "}
        <kbd className="rounded bg-surface px-1 py-0.5 font-mono">h</kbd> snooze
      </p>
      <ul className="space-y-1">
        {entries.map((e, i) => {
          const active = i === selIdx;
          const showSnooze = snoozeFor === e.key;
          return (
            <li key={e.key}>
              <div
                onMouseEnter={() => setSel(i)}
                className={`group flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                  active ? "border-[var(--blue-text)] bg-surface" : "border-[var(--border)] bg-card"
                }`}
              >
                <button type="button" onClick={() => open(e)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-text-primary">{headline(e.latest)}</span>
                    {e.count > 1 && <span className="text-tiny text-text-tertiary">· {e.count} updates</span>}
                    <span className="ml-auto shrink-0 text-tiny text-text-tertiary">{rel(e.latest.createdAt)}</span>
                  </div>
                  {(e.latest.title || e.latest.body) && (
                    <p className="mt-0.5 truncate text-[12.5px] text-text-secondary">
                      {e.latest.title ? `“${e.latest.title}”` : e.latest.body}
                    </p>
                  )}
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => setSnoozeFor(showSnooze ? null : e.key)} title="Snooze (h)" aria-label="Snooze" className="rounded p-1 text-text-tertiary hover:text-[var(--blue-text)]">
                    <Clock size={14} />
                  </button>
                  <button type="button" onClick={() => done(e)} title="Done (e)" aria-label="Mark done" className="rounded p-1 text-text-tertiary hover:text-green-mid">
                    <Check size={14} />
                  </button>
                  <CornerDownLeft size={12} className={`text-text-tertiary ${active ? "opacity-100" : "opacity-0"}`} />
                </div>
              </div>
              {showSnooze && (
                <div className="mt-1 flex flex-wrap gap-1.5 pl-3">
                  {targets.map((t) => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => snooze(e, t.at())}
                      className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-tiny text-text-secondary hover:bg-surface"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function rel(d: Date | string): string {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
