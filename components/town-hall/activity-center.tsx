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
  ChevronRight,
} from "lucide-react";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { SectionLabel } from "@/components/dashboard/shared/section-label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Composer } from "./composer";
import { PostBody } from "./post-body";
import { PostReactions } from "./post-reactions";
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

type FeedType = "all" | "message" | "completion" | "task" | "doc" | "other";
const TYPE_OPTIONS: { value: FeedType; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "message", label: "Messages" },
  { value: "completion", label: "Completions" },
  { value: "task", label: "Tasks" },
  { value: "doc", label: "Docs & files" },
  { value: "other", label: "Other" },
];

function actorId(i: FeedItem): string | null {
  return i.kind === "post" ? i.post.authorId : i.activity.actorId;
}
function actorName(i: FeedItem): string | null {
  return i.kind === "post" ? i.post.authorName : i.activity.actorName;
}
/** Relative time from a server-snapshot `nowMs` (deterministic SSR↔client). */
function rel(at: Date, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - at.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

function feedType(i: FeedItem): FeedType {
  if (i.kind === "post") return "message";
  const a = i.activity;
  if (a.done) return "completion";
  if (a.entity === "milestone" || a.entity === "action_item") return "task";
  if (a.entity === "doc" || a.entity === "file" || a.entity === "link" || a.entity === "note") return "doc";
  return "other";
}

function feedItemId(it: FeedItem): string {
  return it.kind === "post" ? `post:${it.post.id}` : it.activity.id;
}

/** Calendar day "YYYY-MM-DD" of a timestamp IN the user's tz — identical on server +
 *  client (no local-vs-UTC hydration skew). */
function dayKeyInTz(at: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}
function keyToUtcMs(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
/** Today/Yesterday/weekday/date label — deterministic from the keys + tz. */
function dayLabel(key: string, todayKey: string, at: Date, tz: string): string {
  const diff = Math.round((keyToUtcMs(todayKey) - keyToUtcMs(key)) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  try {
    return new Intl.DateTimeFormat(undefined, diff < 7 ? { timeZone: tz, weekday: "long" } : { timeZone: tz, month: "short", day: "numeric" }).format(at);
  } catch {
    return key;
  }
}

type Group =
  | { kind: "divider"; id: string; label: string }
  | { kind: "block"; id: string; actorId: string | null; actorName: string | null; isPost: boolean; items: FeedItem[] };

/** Group the time-sorted feed by day (tz-stable), then compact consecutive same-actor items. */
function groupFeed(items: FeedItem[], todayKey: string, tz: string): Group[] {
  const out: Group[] = [];
  let lastKey = "";
  let block: Extract<Group, { kind: "block" }> | null = null;
  for (const it of items) {
    const key = dayKeyInTz(it.at, tz);
    if (key !== lastKey) {
      out.push({ kind: "divider", id: `d:${key}`, label: dayLabel(key, todayKey, it.at, tz) });
      lastKey = key;
      block = null;
    }
    const aId = actorId(it);
    const isPost = it.kind === "post";
    if (!block || block.actorId !== aId || block.isPost !== isPost) {
      block = { kind: "block", id: `b:${feedItemId(it)}`, actorId: aId, actorName: actorName(it), isPost, items: [] };
      out.push(block);
    }
    block.items.push(it);
  }
  return out;
}

function Initial({ name }: { name: string | null }) {
  const ch = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface text-[11px] font-medium text-text-secondary">
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

function CompactActivity({ a, nowMs }: { a: ActivityEvent; nowMs: number }) {
  const Icon = a.done ? CheckCircle2 : ENTITY_ICON[a.entity] ?? FileText;
  const body = (
    <span>
      <span className="text-text-secondary">{a.verb}</span> <span className="text-text-primary">{a.label}</span>
      <InitiativeBadges initiatives={a.initiatives} />
    </span>
  );
  return (
    <div className="flex items-start gap-1.5 text-[12.5px] leading-snug">
      <Icon size={13} className={`mt-0.5 shrink-0 ${a.done ? "text-green-mid" : "text-text-tertiary"}`} />
      <div className="min-w-0 flex-1">
        {a.href ? (
          <Link href={a.href} className="hover:underline">
            {body}
          </Link>
        ) : (
          body
        )}
        <span className="ml-1.5 text-tiny text-text-tertiary">{rel(a.at, nowMs)}</span>
      </div>
    </div>
  );
}

/** A run of consecutive items within an actor block — either one post, or a
 *  group of same-verb activities that can collapse into a one-line summary. */
type Run = { key: string; isPost: boolean; items: FeedItem[] };
function buildRuns(items: FeedItem[]): Run[] {
  const out: Run[] = [];
  let cur: Run | null = null;
  for (const it of items) {
    const k = it.kind === "post" ? `post:${it.post.id}` : it.activity.verb;
    if (!cur || it.kind === "post" || cur.isPost || cur.key !== k) {
      cur = { key: k, isPost: it.kind === "post", items: [] };
      out.push(cur);
    }
    cur.items.push(it);
  }
  return out;
}

const ENTITY_NOUN: Partial<Record<ActivityEntity, [one: string, many: string]>> = {
  meeting: ["meeting", "meetings"],
  milestone: ["task", "tasks"],
  action_item: ["item", "items"],
  doc: ["doc", "docs"],
  file: ["file", "files"],
  link: ["link", "links"],
  note: ["note", "notes"],
  contact: ["contact", "contacts"],
  project: ["project", "projects"],
  initiative: ["initiative", "initiatives"],
  touch: ["touch", "touches"],
};
function runVerb(a: ActivityEvent): string {
  if (a.done) return "completed";
  switch (a.entity) {
    case "meeting": return "scheduled";
    case "project": return "created";
    case "initiative": return "started";
    case "contact": return "added";
    case "touch": return "logged";
    case "milestone":
    case "action_item": return "added";
    default: return "added"; // docs/files/links/notes
  }
}
/** "scheduled 3 meetings", "completed 2 tasks". */
function summarize(items: ActivityEvent[]): string {
  const a = items[0];
  const noun = ENTITY_NOUN[a.entity] ?? ["item", "items"];
  return `${runVerb(a)} ${items.length} ${noun[1]}`;
}

function ActivityRun({ items, nowMs }: { items: ActivityEvent[]; nowMs: number }) {
  const [open, setOpen] = useState(false);
  const first = items[0];
  const Icon = first.done ? CheckCircle2 : ENTITY_ICON[first.entity] ?? FileText;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[12.5px] leading-snug text-text-secondary hover:text-text-primary"
        aria-expanded={open}
      >
        <Icon size={13} className={`shrink-0 ${first.done ? "text-green-mid" : "text-text-tertiary"}`} />
        <span>{summarize(items)}</span>
        <ChevronRight size={12} className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="ml-[7px] mt-0.5 space-y-0.5 border-l pl-2.5" style={{ borderColor: "var(--border-default)" }}>
          {items.map((a) => (
            <CompactActivity key={a.id} a={a} nowMs={nowMs} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ActivityCenter({
  workspaceId,
  initialFeed,
  members,
  objects,
  docs,
  initiatives,
  tz,
  todayKey,
  nowMs,
}: {
  workspaceId: string;
  initialFeed: FeedItem[];
  members: MemberOption[];
  objects: RefObject[];
  docs: RefObject[];
  initiatives: InitiativePick[];
  tz: string;
  todayKey: string;
  nowMs: number;
}) {
  const router = useRouter();
  const [type, setType] = useState<FeedType>("all");
  const [person, setPerson] = useState<string>("all");
  const [initiative, setInitiative] = useState<string>("all");
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`town-hall:${workspaceId}`, { config: { broadcast: { self: false } } });
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

  const filtered = useMemo(
    () =>
      initialFeed.filter((i) => {
        if (type !== "all" && feedType(i) !== type) return false;
        if (person !== "all" && actorId(i) !== person) return false;
        if (initiative !== "all") {
          if (i.kind !== "activity") return false;
          if (!i.activity.initiatives.some((x) => x.id === initiative)) return false;
        }
        return true;
      }),
    [initialFeed, type, person, initiative],
  );

  const groups = useMemo(() => groupFeed(filtered, todayKey, tz), [filtered, todayKey, tz]);
  const filtersActive = type !== "all" || person !== "all" || initiative !== "all";

  return (
    <DashCard>
      <div className="flex items-center justify-between">
        <SectionLabel icon={Megaphone}>Town Hall</SectionLabel>
        <span className="text-tiny text-text-tertiary tabular-nums">{filtered.length} events</span>
      </div>

      <div className="mt-2">
        <Composer
          members={members}
          objects={objects}
          docs={docs}
          onPosted={onPosted}
          placeholder="Share an update… @mention people, @ÑIGO to ask the AI, #reference a project. ⌘↵ to post."
        />
      </div>

      {/* Filters: type · person · initiative */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Select value={type} onValueChange={(v) => setType(v as FeedType)}>
          <SelectTrigger className="h-7 w-[120px] text-tiny"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={person} onValueChange={setPerson}>
          <SelectTrigger className="h-7 w-[120px] text-tiny"><SelectValue placeholder="Anyone" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Anyone</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.userId} value={m.userId}>{m.displayName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {initiatives.length > 0 && (
          <Select value={initiative} onValueChange={setInitiative}>
            <SelectTrigger className="h-7 w-[150px] text-tiny"><SelectValue placeholder="All initiatives" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All initiatives</SelectItem>
              {initiatives.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {filtersActive && (
          <button
            type="button"
            onClick={() => { setType("all"); setPerson("all"); setInitiative("all"); }}
            className="text-tiny text-text-tertiary underline hover:text-text-secondary"
          >
            Clear
          </button>
        )}
      </div>

      {/* Scrollable, compacted feed */}
      <div className="mt-3 max-h-[48vh] space-y-3 overflow-y-auto pr-1">
        {groups.length === 0 ? (
          <div className="py-6 text-center text-[12px] text-text-secondary">
            {filtersActive ? "No activity matches these filters." : "No activity yet — post an update above."}
          </div>
        ) : (
          groups.map((g) =>
            g.kind === "divider" ? (
              <div key={g.id} className="flex items-center gap-2 pt-1">
                <span className="text-tiny font-medium text-text-tertiary">{g.label}</span>
                <span className="h-px flex-1 bg-[var(--border-default)]" />
              </div>
            ) : (
              <div key={g.id} className="flex gap-2">
                <Initial name={g.actorName} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[12.5px] font-medium text-text-primary">{g.actorName ?? "Someone"}</span>
                    <span className="text-tiny text-text-tertiary">{rel(g.items[0].at, nowMs)}</span>
                  </div>
                  <div className="mt-0.5 space-y-1">
                    {buildRuns(g.items).map((run) =>
                      run.isPost ? (
                        <div key={`post:${run.items[0].kind === "post" ? run.items[0].post.id : run.key}`}>
                          {run.items[0].kind === "post" && (
                            <>
                              <div className="text-[12.5px] text-text-secondary">
                                <PostBody post={run.items[0].post} />
                              </div>
                              <PostReactions
                                postId={run.items[0].post.id}
                                reactions={run.items[0].post.reactions}
                                onChanged={() => router.refresh()}
                              />
                            </>
                          )}
                        </div>
                      ) : run.items.length === 1 && run.items[0].kind === "activity" ? (
                        <CompactActivity key={run.items[0].activity.id} a={run.items[0].activity} nowMs={nowMs} />
                      ) : (
                        <ActivityRun
                          key={run.key + ":" + (run.items[0].kind === "activity" ? run.items[0].activity.id : "")}
                          items={run.items.flatMap((i) => (i.kind === "activity" ? [i.activity] : []))}
                          nowMs={nowMs}
                        />
                      ),
                    )}
                  </div>
                </div>
              </div>
            ),
          )
        )}
      </div>
    </DashCard>
  );
}
