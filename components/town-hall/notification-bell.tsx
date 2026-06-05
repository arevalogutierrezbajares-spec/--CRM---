"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getNotificationsAction,
  getUnreadCountAction,
  markNotificationsReadAction,
} from "@/app/(app)/town-hall/actions";
import { JarvisVoiceCue } from "@/components/jarvis/voice-cue";
import type { NotificationView } from "@/db/queries/town-hall";

function relativeTime(d: Date | string): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const VERB: Record<string, string> = {
  assigned: "assigned you",
  mention: "mentioned you",
  ping: "pinged you",
};

/** The notification headline — handles self-reminders (no actor verb). */
function headline(n: NotificationView): string {
  if (n.kind === "reminder") return "⏰ Reminder";
  return `${n.authorName ?? "Someone"} ${VERB[n.kind] ?? "mentioned you"}`;
}

/**
 * Top-bar notification bell. Shows an unread count and, on open, the recent
 * @mentions. Opening marks everything read. Polls the count periodically so the
 * badge stays fresh across pages.
 */
export function NotificationBell() {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationView[]>([]);
  const [open, setOpen] = useState(false);
  const [voiceSignal, setVoiceSignal] = useState(0);
  const mounted = useRef(true);
  const initialCountLoaded = useRef(false);
  const lastUnreadCount = useRef(0);

  const refreshCount = useCallback(async () => {
    try {
      const n = await getUnreadCountAction();
      if (mounted.current) {
        setCount(n);
        if (initialCountLoaded.current && n > lastUnreadCount.current) {
          setVoiceSignal((signal) => signal + 1);
        }
        lastUnreadCount.current = n;
        initialCountLoaded.current = true;
      }
    } catch {
      // DB not wired / signed out — leave badge at 0.
    }
  }, []);

  // Initial count + polling. setState happens only inside async callbacks /
  // timers — never synchronously in the effect body (lint: set-state-in-effect).
  useEffect(() => {
    mounted.current = true;
    const kickoff = window.setTimeout(() => void refreshCount(), 0);
    const id = window.setInterval(() => void refreshCount(), 30_000);
    return () => {
      mounted.current = false;
      window.clearTimeout(kickoff);
      window.clearInterval(id);
    };
  }, [refreshCount]);

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (next) {
      // Load, but DON'T blanket mark-read — actionable notifications (assigned/
      // pinged/reminder) are marked read only when you click through to them.
      void (async () => {
        try {
          const list = await getNotificationsAction();
          if (mounted.current) setItems(list);
        } catch {
          /* ignore */
        }
      })();
    }
  }, []);

  /** Mark one notification read (on click-through) + reflect it locally. */
  const markOne = useCallback((id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date() } : n)));
    setCount((c) => {
      const next = Math.max(0, c - 1);
      lastUnreadCount.current = next;
      return next;
    });
    void markNotificationsReadAction([id]).catch(() => {});
  }, []);

  const markAll = useCallback(() => {
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date() })));
    lastUnreadCount.current = 0;
    setCount(0);
    void markNotificationsReadAction().catch(() => {});
  }, []);

  return (
    <>
      <JarvisVoiceCue slug="notification-unread-sir" playSignal={voiceSignal} />
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Notifications"
            className="relative grid h-9 w-9 place-items-center rounded-md text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
          >
            <Bell className="h-[18px] w-[18px]" />
            {count > 0 && (
              <span
                className="absolute right-1 top-1 grid min-w-[16px] place-items-center rounded-full px-1 text-[10px] font-semibold leading-none text-white"
                style={{ background: "var(--destructive)", height: 16 }}
              >
                {count > 9 ? "9+" : count}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div
            className="flex items-center justify-between border-b px-3 py-2"
            style={{ borderColor: "var(--border)" }}
          >
            <span className="text-[13px] font-medium">Notifications</span>
            <div className="flex items-center gap-3">
              {items.some((n) => !n.readAt) && (
                <button type="button" onClick={markAll} className="text-tiny text-text-tertiary hover:text-text-secondary">
                  Mark all read
                </button>
              )}
              <Link
                href="/inbox"
                className="text-tiny hover:underline"
                style={{ color: "var(--blue-text)" }}
                onClick={() => setOpen(false)}
              >
                Open Inbox →
              </Link>
            </div>
          </div>
          <div className="max-h-80 overflow-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-[13px] text-text-tertiary">
                No notifications yet.
              </p>
            ) : (
              <ul>
                {items.map((n) => (
                  <li
                    key={n.id}
                    className="border-b px-3 py-2 last:border-b-0"
                    style={{
                      borderColor: "var(--border)",
                      background: n.readAt ? undefined : "var(--surface)",
                    }}
                  >
                    <Link
                      href={n.href}
                      onClick={() => {
                        markOne(n.id);
                        setOpen(false);
                      }}
                      className="block"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-medium text-text-primary">
                          {headline(n)}
                        </span>
                        <span className="shrink-0 text-tiny text-text-tertiary">
                          {relativeTime(n.createdAt)}
                        </span>
                      </div>
                      {(n.title || n.body) && (
                        <p className="mt-0.5 line-clamp-2 text-tiny text-text-secondary">
                          {n.title ? `“${n.title}”` : n.body}
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
