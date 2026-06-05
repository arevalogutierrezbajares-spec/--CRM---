"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  CheckCircle2,
  FileText,
  FolderOpen,
  Calendar,
  UserPlus,
  MessageCircle,
  Target,
  ListTodo,
  Megaphone,
} from "lucide-react";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import { Composer } from "./composer";
import { PostBody } from "./post-body";
import { PostReactions } from "./post-reactions";
import { formatRelative } from "@/lib/utils";
import type { MemberOption, RefObject } from "./types";
import type { FeedItem } from "@/db/queries/town-hall-feed";
import type { ActivityEntity, ActivityEvent } from "@/db/queries/activity";
import type { InitiativePick } from "@/db/queries/item-initiatives";

const ENTITY_ICON: Record<ActivityEntity, typeof FileText> = {
  doc: FileText,
  file: FileText,
  link: FileText,
  note: FileText,
  project: FolderOpen,
  contact: UserPlus,
  meeting: Calendar,
  touch: MessageCircle,
  milestone: ListTodo,
  action_item: ListTodo,
  initiative: Target,
};

function Initial({ name }: { name: string | null }) {
  const ch = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface text-[11px] font-medium text-text-secondary">
      {ch}
    </span>
  );
}

function InitiativeBadges({ initiatives }: { initiatives: InitiativePick[] }) {
  if (initiatives.length === 0) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {initiatives.map((i) => (
        <Link
          key={i.id}
          href={`/initiatives/${i.id}`}
          className="rounded-full bg-[var(--blue-soft)] px-1.5 py-px text-[10px] text-[var(--blue-text)] hover:underline"
        >
          {i.title}
        </Link>
      ))}
    </span>
  );
}

export function ActivityCenter({
  workspaceId,
  initialFeed,
  members,
  objects,
  docs,
  initiatives,
}: {
  workspaceId: string;
  initialFeed: FeedItem[];
  members: MemberOption[];
  objects: RefObject[];
  docs: RefObject[];
  initiatives: InitiativePick[];
}) {
  const router = useRouter();
  const [activeInitiative, setActiveInitiative] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Near-realtime: when anyone posts, refetch the server feed. setState/refresh
  // live only in the async broadcast callback (never the effect body).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`town-hall:${workspaceId}`, {
      config: { broadcast: { self: false } },
    });
    channel.on("broadcast", { event: "new-post" }, () => router.refresh());
    channel.subscribe();
    channelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [workspaceId, router]);

  function onPosted() {
    channelRef.current?.send({ type: "broadcast", event: "new-post", payload: {} });
    router.refresh();
  }

  const filtered = useMemo(() => {
    if (!activeInitiative) return initialFeed;
    // Filtering by an initiative shows only activity tied to it (messages are
    // workspace-wide, so they drop out of an initiative-scoped view).
    return initialFeed.filter(
      (i) => i.kind === "activity" && i.activity.initiatives.some((x) => x.id === activeInitiative),
    );
  }, [initialFeed, activeInitiative]);

  return (
    <DashCard>
      <div className="flex items-center justify-between">
        <SectionLabel icon={Megaphone}>Town Hall</SectionLabel>
        <span className="text-tiny text-text-tertiary">activity &amp; messages</span>
      </div>

      <div className="mt-2">
        <Composer
          members={members}
          objects={objects}
          docs={docs}
          onPosted={onPosted}
          placeholder="Share an update… @mention people, #reference a project. ⌘↵ to post."
        />
      </div>

      {/* Initiative filter chips */}
      {initiatives.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <FilterChip label="All" active={!activeInitiative} onClick={() => setActiveInitiative(null)} />
          {initiatives.map((i) => (
            <FilterChip
              key={i.id}
              label={i.title}
              active={activeInitiative === i.id}
              onClick={() => setActiveInitiative(i.id)}
            />
          ))}
        </div>
      )}

      {/* Feed */}
      <ul className="mt-3 space-y-3">
        {filtered.length === 0 ? (
          <li className="py-6 text-center text-[12px] text-text-secondary">
            {activeInitiative ? "No activity for this initiative yet." : "No activity yet — post an update above."}
          </li>
        ) : (
          filtered.map((item) =>
            item.kind === "post" ? (
              <li key={`post:${item.post.id}`} className="flex gap-2">
                <Initial name={item.post.authorName} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[12.5px] font-medium text-text-primary">{item.post.authorName}</span>
                    <span className="text-tiny text-text-tertiary">{formatRelative(item.post.createdAt)}</span>
                  </div>
                  <div className="text-[12.5px] text-text-secondary">
                    <PostBody post={item.post} />
                  </div>
                  <PostReactions
                    postId={item.post.id}
                    reactions={item.post.reactions}
                    onChanged={() => router.refresh()}
                  />
                </div>
              </li>
            ) : (
              <ActivityLine key={item.activity.id} activity={item.activity} />
            ),
          )
        )}
      </ul>
    </DashCard>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2 py-0.5 text-tiny transition-colors ${
        active
          ? "border-[var(--blue-mid)] bg-[var(--blue-soft)] text-[var(--blue-text)]"
          : "border-[var(--border)] text-text-tertiary hover:text-text-secondary"
      }`}
    >
      {label}
    </button>
  );
}

function ActivityLine({ activity: a }: { activity: ActivityEvent }) {
  const Icon = a.done ? CheckCircle2 : ENTITY_ICON[a.entity] ?? FileText;
  const body = (
    <span className="min-w-0">
      <span className="font-medium text-text-primary">{a.actorName ?? "Someone"}</span>{" "}
      <span className="text-text-secondary">{a.verb}</span>{" "}
      <span className="text-text-primary">{a.label}</span>
      <InitiativeBadges initiatives={a.initiatives} />
    </span>
  );
  return (
    <li className="flex items-start gap-2">
      <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${a.done ? "text-green-mid" : "text-text-tertiary"}`}>
        <Icon size={14} />
      </span>
      <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
        {a.href ? (
          <Link href={a.href} className="hover:underline">
            {body}
          </Link>
        ) : (
          body
        )}
        <div className="text-tiny text-text-tertiary">{formatRelative(a.at)}</div>
      </div>
    </li>
  );
}
