"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Briefcase,
  ChevronDown,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteMeetingAction } from "@/app/(app)/meetings/actions";
import type { MeetingListItem } from "@/db/queries/meetings";
import {
  formatMeetingTime,
  meetingDayKey,
  MEETING_TZ_LABEL,
} from "@/lib/date/meeting-time";

const TYPE_LABEL: Record<string, string> = {
  one_on_one: "1:1",
  group: "Group",
  event: "Event",
  call: "Call",
};

type Kind = "client" | "internal";
type Segment = "all" | Kind;
type Group = "today" | "upcoming" | "past";

const GROUP_ORDER: Group[] = ["today", "upcoming", "past"];
const GROUP_LABEL: Record<Group, string> = {
  today: "Today",
  upcoming: "Upcoming",
  past: "Past",
};

/**
 * Client = has external attendees OR is tied to a project (the two signals of a
 * client-facing engagement). Internal = neither — a team-only meeting.
 */
function kindOf(m: MeetingListItem): Kind {
  return m.attendeeCount > 0 || m.projectTitle ? "client" : "internal";
}

function groupOf(m: MeetingListItem, todayKey: string): Group {
  const key = meetingDayKey(m.scheduledAt);
  if (key === todayKey) return "today";
  return key > todayKey ? "upcoming" : "past";
}

/**
 * Make raw minutes/agenda readable as a one-line peek: drop checkbox markers and
 * leading markdown structure, strip inline emphasis — but never touch hyphens or
 * underscores inside words (so "follow-up", "Q1-Q2", "snake_case" survive).
 */
function clean(s: string): string {
  return s
    .replace(/\[[ xX]?\]/g, "") // [ ] / [x] checkboxes
    .replace(/^[\s>#*+-]+/gm, "") // leading list/heading/quote markers per line
    .replace(/[*`]/g, "") // inline emphasis / code ticks
    .replace(/\s+/g, " ")
    .trim();
}

function summaryOf(m: MeetingListItem): { label: string; text: string } | null {
  const minutes = (m.minutes ?? "").trim();
  if (minutes) return { label: "Summary", text: clean(minutes) };
  const agenda = (m.agenda ?? "").trim();
  if (agenda) return { label: "Agenda", text: clean(agenda) };
  return null;
}

export function MeetingsList({
  meetings,
  todayKey,
}: {
  meetings: MeetingListItem[];
  todayKey: string;
}) {
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<Segment>("all");
  const [project, setProject] = useState("");

  // Pre-tag each meeting once.
  const tagged = useMemo(
    () =>
      meetings.map((m) => ({
        m,
        kind: kindOf(m),
        group: groupOf(m, todayKey),
      })),
    [meetings, todayKey],
  );

  const counts = useMemo(() => {
    let client = 0;
    let internal = 0;
    for (const t of tagged) {
      if (t.kind === "client") client++;
      else internal++;
    }
    return { all: tagged.length, client, internal };
  }, [tagged]);

  const projects = useMemo(() => {
    const set = new Set<string>();
    for (const { m } of tagged) if (m.projectTitle) set.add(m.projectTitle);
    return Array.from(set).sort();
  }, [tagged]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return tagged.filter(({ m, kind }) => {
      if (segment !== "all" && kind !== segment) return false;
      if (project && m.projectTitle !== project) return false;
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        (m.location ?? "").toLowerCase().includes(q) ||
        (m.projectTitle ?? "").toLowerCase().includes(q) ||
        m.attendeeNames.some((n) => n.toLowerCase().includes(q))
      );
    });
  }, [tagged, search, segment, project]);

  const grouped = useMemo(() => {
    const map: Record<Group, typeof filtered> = {
      today: [],
      upcoming: [],
      past: [],
    };
    for (const t of filtered) map[t.group].push(t);
    // Today + Upcoming: soonest first. Past: most recent first.
    map.today.sort((a, b) => +a.m.scheduledAt - +b.m.scheduledAt);
    map.upcoming.sort((a, b) => +a.m.scheduledAt - +b.m.scheduledAt);
    map.past.sort((a, b) => +b.m.scheduledAt - +a.m.scheduledAt);
    return map;
  }, [filtered]);

  const active = !!(search || project) || segment !== "all";

  return (
    <div className="space-y-5">
      {/* Segments */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Filter by meeting type"
          className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--card)] p-0.5"
        >
          <SegBtn active={segment === "all"} onClick={() => setSegment("all")}>
            All <Count n={counts.all} active={segment === "all"} />
          </SegBtn>
          <SegBtn
            active={segment === "client"}
            onClick={() => setSegment("client")}
          >
            <Users className="h-3.5 w-3.5" /> Client{" "}
            <Count n={counts.client} active={segment === "client"} />
          </SegBtn>
          <SegBtn
            active={segment === "internal"}
            onClick={() => setSegment("internal")}
          >
            <Briefcase className="h-3.5 w-3.5" /> Internal{" "}
            <Count n={counts.internal} active={segment === "internal"} />
          </SegBtn>
        </div>

        {projects.length > 0 && (
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            className="min-h-[38px] rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            aria-label="Filter by project"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}

        <div className="relative ml-auto min-w-[180px] flex-1 sm:flex-none sm:basis-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search meetings…"
            className="min-h-[38px] w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-2 pl-9 pr-8 text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {active && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSegment("all");
              setProject("");
            }}
            className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            Reset
          </button>
        )}
      </div>

      {/* Grouped list */}
      {filtered.length === 0 ? (
        <Card className="grid place-items-center px-6 py-12 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">
            No meetings match these filters.
          </p>
        </Card>
      ) : (
        <div className="space-y-7">
          {GROUP_ORDER.map((g) => {
            const items = grouped[g];
            if (items.length === 0) return null;
            return (
              <section key={g}>
                <div className="mb-2 flex items-baseline gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                    {GROUP_LABEL[g]}
                  </h2>
                  <span className="text-xs text-[var(--muted-foreground)]/60">
                    {items.length}
                  </span>
                </div>
                <Card className="overflow-hidden">
                  <ul className="divide-y divide-[var(--border)]">
                    {items.map(({ m, kind }) => (
                      <MeetingRow key={m.id} meeting={m} kind={kind} />
                    ))}
                  </ul>
                </Card>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm"
          : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      }`}
    >
      {children}
    </button>
  );
}

function Count({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      aria-hidden
      className={`rounded-full px-1.5 text-xs tabular-nums ${
        active ? "bg-white/20" : "bg-[var(--muted)] text-[var(--muted-foreground)]"
      }`}
    >
      {n}
    </span>
  );
}

function MeetingRow({
  meeting: m,
  kind,
}: {
  meeting: MeetingListItem;
  kind: Kind;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { date, time } = formatMeetingTime(m.scheduledAt);
  const summary = summaryOf(m);

  return (
    <li className="transition-colors hover:bg-[var(--muted)]/30">
      <div className="flex items-stretch gap-3 px-4 py-3">
        {/* Time rail */}
        <div className="flex w-[68px] flex-none flex-col justify-center border-r border-[var(--border)] pr-3 text-right">
          <div className="text-xs text-[var(--muted-foreground)]">{date}</div>
          <div className="text-sm font-semibold tabular-nums">{time}</div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]/70">
            {MEETING_TZ_LABEL}
          </div>
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/meetings/${m.id}`}
              className="text-sm font-medium hover:underline"
            >
              {m.title}
            </Link>
            <KindChip kind={kind} />
            <Badge variant="outline" className="text-[11px]">
              {TYPE_LABEL[m.type] ?? m.type}
            </Badge>
            {m.projectTitle && (
              <span className="inline-flex max-w-[200px] items-center gap-1 rounded-full bg-[var(--primary)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--primary)]">
                <Briefcase className="h-3 w-3 flex-none" />
                <span className="truncate">{m.projectTitle}</span>
              </span>
            )}
            {m.openActionItems > 0 && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                {m.openActionItems} open
              </span>
            )}
          </div>

          <div className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">
            {m.attendeeNames.length > 0
              ? m.attendeeNames.slice(0, 3).join(", ") +
                (m.attendeeNames.length > 3
                  ? ` +${m.attendeeNames.length - 3}`
                  : "")
              : "No attendees"}
            {m.location ? ` · ${m.location}` : ""}
          </div>

          {summary && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="mt-1.5 flex w-full items-start gap-1 text-left text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <ChevronDown
                className={`mt-0.5 h-3.5 w-3.5 flex-none transition-transform ${
                  open ? "rotate-180" : ""
                }`}
              />
              <span className={open ? "" : "line-clamp-1"}>
                <span className="font-medium uppercase tracking-wide text-[var(--muted-foreground)]/70">
                  {summary.label}:
                </span>{" "}
                {open ? summary.text : summary.text.slice(0, 120)}
              </span>
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-none items-center gap-1">
          <Button asChild size="sm" variant="ghost" className="text-xs">
            <Link href={`/meetings/${m.id}`}>Open</Link>
          </Button>
          <ConfirmDialog
            title="Delete this meeting?"
            description={
              <>
                <span className="font-medium text-[var(--foreground)]">{m.title}</span>{" "}
                and its attendee touches will be removed. This can&apos;t be undone.
              </>
            }
            confirmLabel="Delete"
            destructive
            onConfirm={async () => {
              const res = await deleteMeetingAction(m.id);
              if (res.ok) {
                toast.success("Meeting deleted");
                router.refresh();
              } else {
                toast.error(res.error);
              }
            }}
            trigger={(openConfirm) => (
              <button
                type="button"
                onClick={openConfirm}
                aria-label={`Delete ${m.title}`}
                className="grid h-9 w-9 flex-none place-items-center rounded-md text-[var(--muted-foreground)] transition hover:bg-[var(--destructive)]/10 hover:text-[var(--destructive)]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          />
        </div>
      </div>
    </li>
  );
}

function KindChip({ kind }: { kind: Kind }) {
  if (kind === "client") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        <Users className="h-3 w-3" /> Client
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--muted-foreground)]">
      <Briefcase className="h-3 w-3" /> Internal
    </span>
  );
}
