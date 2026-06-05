"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Radio, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { MeetingListItem } from "@/db/queries/meetings";
import { formatDateTime } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  one_on_one: "1:1",
  group: "group",
  event: "event",
  call: "call",
};

function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isThisWeek(d: Date): boolean {
  if (isToday(d)) return false;
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  return d >= weekStart && d < weekEnd;
}

function isUpcoming(d: Date): boolean {
  if (isToday(d)) return false;
  return d > new Date();
}

type Group = "today" | "upcoming" | "this-week" | "past";

function getGroup(m: MeetingListItem): Group {
  if (isToday(m.scheduledAt)) return "today";
  if (isUpcoming(m.scheduledAt)) return "upcoming";
  if (isThisWeek(m.scheduledAt)) return "this-week";
  return "past";
}

const GROUP_ORDER: Group[] = ["today", "upcoming", "this-week", "past"];
const GROUP_LABEL: Record<Group, string> = {
  today: "Today",
  upcoming: "Upcoming",
  "this-week": "This week",
  past: "Past",
};

interface MeetingsListProps {
  meetings: MeetingListItem[];
}

export function MeetingsList({ meetings }: MeetingsListProps) {
  const [search, setSearch] = useState("");
  const [contactFilter, setContactFilter] = useState("");

  // Collect all attendee names for the dropdown
  const allNames = useMemo(() => {
    const set = new Set<string>();
    for (const m of meetings) {
      for (const n of m.attendeeNames) set.add(n);
    }
    return Array.from(set).sort();
  }, [meetings]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return meetings.filter((m) => {
      if (contactFilter && !m.attendeeNames.includes(contactFilter)) return false;
      if (!q) return true;
      if (m.title.toLowerCase().includes(q)) return true;
      if (m.location?.toLowerCase().includes(q)) return true;
      if (m.projectTitle?.toLowerCase().includes(q)) return true;
      if (m.attendeeNames.some((n) => n.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [meetings, search, contactFilter]);

  const grouped = useMemo(() => {
    const map = new Map<Group, MeetingListItem[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    for (const m of filtered) {
      map.get(getGroup(m))!.push(m);
    }
    return map;
  }, [filtered]);

  const hasResults = filtered.length > 0;

  return (
    <div className="space-y-6">
      {/* Search + filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search meetings…"
            className="min-h-[44px] w-full rounded-md border border-[var(--border)] bg-[var(--background)] py-2 pl-9 pr-9 text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] sm:min-h-0"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-1 top-1/2 flex h-[40px] w-[40px] -translate-y-1/2 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {allNames.length > 0 && (
          <select
            value={contactFilter}
            onChange={(e) => setContactFilter(e.target.value)}
            className="min-h-[44px] rounded-md border border-[var(--border)] bg-[var(--background)] py-2 pl-3 pr-8 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] sm:min-h-0"
          >
            <option value="">All contacts</option>
            {allNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}

        {(search || contactFilter) && (
          <button
            type="button"
            onClick={() => { setSearch(""); setContactFilter(""); }}
            className="min-h-[44px] rounded-md px-2 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] sm:min-h-0"
          >
            Clear
          </button>
        )}
      </div>

      {/* Grouped list */}
      {!hasResults ? (
        <Card className="grid place-items-center px-6 py-10 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">No meetings match your filters.</p>
        </Card>
      ) : (
        <div className="space-y-8">
          {GROUP_ORDER.map((group) => {
            const items = grouped.get(group)!;
            if (items.length === 0) return null;
            return (
              <section key={group}>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
                  {GROUP_LABEL[group]}
                </h2>
                <Card className="overflow-hidden">
                  <ul className="divide-y divide-[var(--border)]">
                    {items.map((m) => (
                      <MeetingRow key={m.id} meeting={m} group={group} />
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

function MeetingRow({
  meeting: m,
  group,
}: {
  meeting: MeetingListItem;
  group: Group;
}) {
  const showGoLive = group === "today";

  return (
    <li className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--muted)]/30 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/meetings/${m.id}`}
            className="inline-flex min-h-[40px] items-center rounded-sm text-sm font-medium hover:underline sm:min-h-0"
          >
            {m.title}
          </Link>
          {m.openActionItems > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              {m.openActionItems} open AI{m.openActionItems === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">
          {formatDateTime(m.scheduledAt)}
          {m.location ? ` · ${m.location}` : ""}
          {m.projectTitle ? ` · ${m.projectTitle}` : ""}
          {m.attendeeNames.length > 0 && (
            <> · {m.attendeeNames.slice(0, 3).join(", ")}
              {m.attendeeNames.length > 3 && ` +${m.attendeeNames.length - 3}`}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Badge variant="outline" className="text-xs">
          {TYPE_LABEL[m.type] ?? m.type}
        </Badge>
        {showGoLive && (
          <Button asChild size="sm" variant="outline" className="gap-1 px-2 text-xs text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 dark:border-red-800 dark:text-red-400 sm:h-7">
            <Link href={`/meetings/${m.id}?live=1`}>
              <Radio className="h-3 w-3" /> Go Live
            </Link>
          </Button>
        )}
      </div>
    </li>
  );
}
