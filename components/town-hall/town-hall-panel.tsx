"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Megaphone, Maximize2 } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Composer } from "./composer";
import { PostBody } from "./post-body";
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
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Chat order: oldest at top, newest at the bottom.
  const posts = [...initialPosts].reverse();

  // Live updates. No setState in the effect body — only router.refresh + the DOM.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`town-hall:${workspaceId}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;
    channel
      .on("broadcast", { event: "new-post" }, () => router.refresh())
      .subscribe();
    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [workspaceId, router]);

  // Stick to the bottom as new messages arrive.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [initialPosts.length]);

  const handlePosted = useCallback(() => {
    router.refresh();
    channelRef.current?.send({ type: "broadcast", event: "new-post", payload: {} });
  }, [router]);

  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg border bg-card"
      style={{ borderColor: "var(--border)", maxHeight: "62vh" }}
    >
      <div
        className="flex shrink-0 items-center justify-between border-b px-3 py-2"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-1.5 text-label" style={{ color: "var(--purple-text)" }}>
          <Megaphone size={14} />
          <span>Town Hall</span>
        </div>
        <Link
          href="/town-hall"
          aria-label="Expand Town Hall"
          className="rounded p-1 text-text-tertiary transition-colors hover:bg-surface hover:text-text-primary"
        >
          <Maximize2 size={13} />
        </Link>
      </div>

      <div ref={scrollRef} className="min-h-[120px] flex-1 space-y-2.5 overflow-y-auto px-3 py-2.5">
        {posts.length === 0 ? (
          <p className="py-8 text-center text-tiny text-text-tertiary">
            No messages yet. Say hi to the team 👋
          </p>
        ) : (
          posts.map((post) => (
            <div key={post.id} className="flex items-start gap-2">
              <div
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-semibold"
                style={{ background: "var(--surface)", color: "var(--text-secondary)" }}
              >
                {initials(post.authorName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[12px] font-medium text-text-primary">{post.authorName}</span>
                  <span className="text-[10px] text-text-tertiary">{relTime(post.createdAt)}</span>
                </div>
                <PostBody post={post} />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="shrink-0 border-t px-2.5 py-2" style={{ borderColor: "var(--border)" }}>
        <Composer members={members} objects={objects} onPosted={handlePosted} />
      </div>
    </div>
  );
}
