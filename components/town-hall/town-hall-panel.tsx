"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Megaphone, Maximize2, ArrowDown } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { loadRecentPostsAction } from "@/app/(app)/town-hall/actions";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
} from "@/components/ui/sheet";
import { Composer } from "./composer";
import { Feed } from "./feed";
import { PostBody } from "./post-body";
import { PostReactions } from "./post-reactions";
import { usePresence } from "@/lib/presence/presence-context";
import type { MemberOption, PostView, RefObject } from "./types";

function relTime(d: Date): string {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Compact, Slack-style Town Hall chat docked in the dashboard right rail.
 * Messages oldest→newest (newest at the bottom), auto-scrolls, live via Supabase
 * Realtime, with an inline composer. "Expand" opens the full /town-hall view.
 */
export function TownHallPanel({
  workspaceId,
  initialPosts,
  members,
  objects,
}: {
  workspaceId: string;
  initialPosts: PostView[];
  members: MemberOption[];
  objects: RefObject[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const atBottomRef = useRef(true);
  const [expanded, setExpanded] = useState(false);
  // Chat order: oldest at top, newest at the bottom. Held in state so we can
  // append live without re-running the whole page (no router.refresh).
  const [posts, setPosts] = useState<PostView[]>(() => [...initialPosts].reverse());
  const [hasNew, setHasNew] = useState(false);
  const presence = usePresence();
  const online = presence?.online.length ?? 0;

  function scrollToBottom() {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setHasNew(false);
  }

  // Lightweight refresh: fetch just the posts, then either stick to the bottom
  // (if already there / we posted) or raise a "new messages" pill. setState runs
  // inside async/rAF callbacks — never synchronously in an effect body.
  const refresh = useCallback(async (forceBottom = false) => {
    let next: PostView[];
    try {
      next = await loadRecentPostsAction();
    } catch {
      // Transient network/realtime blip — keep the current posts rather than
      // throwing an unhandled rejection out of the broadcast handler.
      return;
    }
    setPosts([...next].reverse());
    requestAnimationFrame(() => {
      if (forceBottom || atBottomRef.current) scrollToBottom();
      else setHasNew(true);
    });
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`town-hall:${workspaceId}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;
    channel.on("broadcast", { event: "new-post" }, () => void refresh()).subscribe();
    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [workspaceId, refresh]);

  // Scroll to bottom once on mount (DOM only).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    atBottomRef.current = atBottom;
    if (atBottom && hasNew) setHasNew(false);
  }

  const handlePosted = useCallback(() => {
    void refresh(true); // we posted → jump to bottom
    channelRef.current?.send({ type: "broadcast", event: "new-post", payload: {} });
  }, [refresh]);

  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-lg border bg-card"
      style={{ borderColor: "var(--border)", maxHeight: "62vh" }}
    >
      <div
        className="flex shrink-0 items-center justify-between border-b px-3 py-2"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-1.5 text-label" style={{ color: "var(--purple-text)" }}>
          <Megaphone size={14} />
          <span>Town Hall</span>
          {online > 0 && (
            <span className="flex items-center gap-1 text-tiny font-normal text-text-tertiary">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--green-mid)" }} />
              {online} online
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Expand Town Hall"
          className="rounded p-1 text-text-tertiary transition-colors hover:bg-surface hover:text-text-primary"
        >
          <Maximize2 size={13} />
        </button>
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="relative min-h-[120px] flex-1 space-y-2.5 overflow-y-auto px-3 py-2.5">
        {posts.length === 0 ? (
          <p className="py-8 text-center text-tiny text-text-tertiary">
            No messages yet. Say hi to the team 👋
          </p>
        ) : (
          posts.map((post) => (
            <div key={post.id} className="group flex items-start gap-2">
              <div
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-semibold"
                style={{ background: "var(--surface)", color: "var(--text-secondary)" }}
              >
                {initials(post.authorName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[12px] font-medium text-text-primary">{post.authorName}</span>
                  <span className="text-[10px] text-text-tertiary" suppressHydrationWarning>{relTime(post.createdAt)}</span>
                </div>
                <PostBody post={post} />
                <PostReactions postId={post.id} reactions={post.reactions} onChanged={() => void refresh()} />
              </div>
            </div>
          ))
        )}
      </div>

      {hasNew && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-[68px] left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full px-2.5 py-1 text-tiny font-medium text-white shadow-lg"
          style={{ background: "var(--blue-text)" }}
        >
          <ArrowDown size={12} /> New messages
        </button>
      )}

      <div className="shrink-0 border-t px-2.5 py-2" style={{ borderColor: "var(--border)" }}>
        <Composer members={members} objects={objects} onPosted={handlePosted} />
      </div>

      {/* Half-screen popout — the full feed (composer + notes→action-items). */}
      <Sheet open={expanded} onOpenChange={setExpanded}>
        <SheetContent className="w-[min(760px,96vw)]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-1.5">
              <Megaphone size={16} style={{ color: "var(--purple-text)" }} />
              Town Hall
            </SheetTitle>
          </SheetHeader>
          <SheetBody>
            {expanded && (
              <Feed
                workspaceId={workspaceId}
                initialPosts={initialPosts}
                members={members}
                objects={objects}
                // The rail panel already owns the one Realtime subscription for
                // this workspace channel; a second subscription to the same
                // topic on the same client collides. The popout relies on its
                // own post→router.refresh and reopen for freshness.
                subscribe={false}
              />
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}
