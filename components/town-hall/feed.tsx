"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { CornerDownRight, MessageSquare } from "lucide-react";
import { Composer } from "./composer";
import { ExtractNotesDialog } from "./extract-notes-dialog";
import { PostBody } from "./post-body";
import { PostReactions } from "./post-reactions";
import type { MemberOption, PostView, RefObject } from "./types";

function relativeTime(d: Date): string {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Live Town Hall feed. Renders the composer + the chronological post list, and
 * subscribes to a Supabase Realtime broadcast channel: when anyone posts, we
 * refresh the server data so new posts appear without a manual reload.
 */
export function Feed({
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
  const [refreshing, setRefreshing] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Subscribe once. setState lives only in the async broadcast callback —
  // never synchronously in the effect body (lint: set-state-in-effect).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`town-hall:${workspaceId}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "new-post" }, () => {
        setRefreshing(true);
        router.refresh();
        // Clear the indicator shortly after; the server data swaps in.
        window.setTimeout(() => setRefreshing(false), 800);
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [workspaceId, router]);

  const handlePosted = useCallback(() => {
    // Refresh our own view, and tell peers to refresh theirs.
    router.refresh();
    channelRef.current?.send({
      type: "broadcast",
      event: "new-post",
      payload: {},
    });
  }, [router]);

  // Light threading: top-level posts (newest-first as fetched) + their replies.
  const topLevel = initialPosts.filter((p) => !p.parentPostId);
  const repliesByParent = new Map<string, PostView[]>();
  for (const p of initialPosts) {
    if (!p.parentPostId) continue;
    const arr = repliesByParent.get(p.parentPostId) ?? repliesByParent.set(p.parentPostId, []).get(p.parentPostId)!;
    arr.push(p);
  }
  for (const arr of repliesByParent.values()) {
    arr.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <ExtractNotesDialog />
      </div>

      <Composer members={members} objects={objects} onPosted={handlePosted} />

      {refreshing && (
        <p className="text-tiny text-text-tertiary">New activity — updating…</p>
      )}

      {initialPosts.length === 0 ? (
        <div
          className="rounded-lg border bg-card p-8 text-center"
          style={{ borderColor: "var(--border)" }}
        >
          <p className="text-[13px] text-text-secondary">
            Nothing here yet. Post the first update to the team.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {topLevel.map((post) => {
            const replies = repliesByParent.get(post.id) ?? [];
            return (
              <li
                key={post.id}
                className="rounded-lg border bg-card p-3"
                style={{ borderColor: "var(--border)" }}
              >
                <PostCard post={post} onChanged={handlePosted}>
                  <button
                    type="button"
                    onClick={() => setReplyTo((r) => (r === post.id ? null : post.id))}
                    className="flex items-center gap-1 text-tiny text-text-tertiary hover:text-text-secondary"
                  >
                    <MessageSquare size={11} />
                    {replies.length > 0 ? `${replies.length} repl${replies.length === 1 ? "y" : "ies"}` : "Reply"}
                  </button>
                </PostCard>

                {(replies.length > 0 || replyTo === post.id) && (
                  <div className="mt-2 space-y-2 border-l-2 border-[var(--border)] pl-3">
                    {replies.map((rep) => (
                      <div key={rep.id} className="flex gap-1.5">
                        <CornerDownRight size={12} className="mt-1 shrink-0 text-text-tertiary" />
                        <div className="min-w-0 flex-1">
                          <PostCard post={rep} onChanged={handlePosted} compact />
                        </div>
                      </div>
                    ))}
                    {replyTo === post.id && (
                      <Composer
                        members={members}
                        objects={objects}
                        parentPostId={post.id}
                        placeholder="Reply…"
                        onPosted={() => {
                          setReplyTo(null);
                          handlePosted();
                        }}
                      />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PostCard({
  post,
  onChanged,
  compact,
  children,
}: {
  post: PostView;
  onChanged: () => void;
  compact?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="group flex items-start gap-2.5">
      <div
        className={`grid shrink-0 place-items-center rounded-full font-semibold ${compact ? "h-6 w-6 text-[10px]" : "h-7 w-7 text-tiny"}`}
        style={{ background: "var(--surface)", color: "var(--text-secondary)" }}
      >
        {initials(post.authorName)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-text-primary">{post.authorName}</span>
          {post.kind === "note" && (
            <span className="rounded px-1.5 py-0.5 text-tiny uppercase" style={{ background: "var(--surface)", color: "var(--text-tertiary)" }}>
              note
            </span>
          )}
          <span className="text-tiny text-text-tertiary">{relativeTime(post.createdAt)}</span>
        </div>
        <div className="mt-1">
          <PostBody post={post} />
        </div>
        <div className="mt-1 flex items-center gap-3">
          <PostReactions postId={post.id} reactions={post.reactions} onChanged={onChanged} />
          {children}
        </div>
      </div>
    </div>
  );
}
