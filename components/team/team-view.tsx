"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePresence } from "@/lib/presence/presence-context";
import { formatRelative } from "@/lib/utils";
import type { TeamMember } from "@/db/queries/team";
import type { ActivityEvent } from "@/db/queries/activity";

function colorFromId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h}, 65%, 55%)`;
}

function Avatar({ name, color, size = 28 }: { name: string; color: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-medium text-white"
      style={{ background: color, width: size, height: size, fontSize: size * 0.4 }}
    >
      {(name || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function TeamView({
  members,
  activity,
  selfId,
}: {
  members: TeamMember[];
  activity: ActivityEvent[];
  selfId: string;
}) {
  const presence = usePresence();
  const onlineById = useMemo(() => {
    const m = new Map<string, string>(); // userId → "working on" label
    for (const p of presence?.online ?? []) m.set(p.userId, p.label);
    return m;
  }, [presence]);

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const ao = onlineById.has(a.userId) ? 0 : 1;
      const bo = onlineById.has(b.userId) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [members, onlineById]);

  const today = activity.filter((e) => isToday(e.at));
  const earlier = activity.filter((e) => !isToday(e.at));
  const onlineCount = sortedMembers.filter((m) => onlineById.has(m.userId)).length;

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-text-primary">Team</h1>
        <p className="text-sm text-text-tertiary">
          {onlineCount} online · {members.length} member{members.length === 1 ? "" : "s"}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Members + presence */}
        <section className="space-y-1">
          <h2 className="mb-2 text-label text-text-secondary">Members</h2>
          {sortedMembers.map((m) => {
            const online = onlineById.has(m.userId);
            const workingOn = onlineById.get(m.userId);
            return (
              <div
                key={m.userId}
                className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-surface"
              >
                <div className="relative">
                  <Avatar name={m.displayName} color={colorFromId(m.userId)} />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--background)] ${
                      online ? "bg-[var(--risk-green,#1A5C2A)]" : "bg-text-faint"
                    }`}
                    style={!online ? { background: "var(--border-default)" } : undefined}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[13px] text-text-primary">
                    <span className="truncate">{m.displayName}</span>
                    {m.userId === selfId && (
                      <span className="text-tiny text-text-tertiary">(you)</span>
                    )}
                    {m.role !== "member" && (
                      <span className="rounded bg-surface px-1 text-[9px] uppercase tracking-wide text-text-tertiary">
                        {m.role}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-tiny text-text-tertiary">
                    {online
                      ? workingOn
                        ? `Online · ${workingOn}`
                        : "Online"
                      : m.lastSeenAt
                        ? `Last seen ${formatRelative(m.lastSeenAt)}`
                        : "Hasn't signed in yet"}
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        {/* Activity feed */}
        <section>
          <h2 className="mb-2 text-label text-text-secondary">Recent activity</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-text-tertiary">No activity yet.</p>
          ) : (
            <div className="space-y-5">
              {today.length > 0 && <ActivityGroup title="Today" events={today} />}
              {earlier.length > 0 && <ActivityGroup title="Earlier" events={earlier} />}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ActivityGroup({ title, events }: { title: string; events: ActivityEvent[] }) {
  return (
    <div>
      <div className="mb-1.5 text-tiny font-medium uppercase tracking-wide text-text-tertiary">
        {title}
      </div>
      <ul className="space-y-0.5">
        {events.map((e) => (
          <li key={e.id} className="flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface">
            <Avatar
              name={e.actorName ?? "?"}
              color={colorFromId(e.actorId ?? e.id)}
              size={22}
            />
            <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
              <span className="text-text-primary">{e.actorName ?? "Someone"}</span>{" "}
              <span className="text-text-secondary">{e.verb}</span>{" "}
              {e.href ? (
                <Link href={e.href} className="text-[var(--blue-text)] hover:underline">
                  {e.label}
                </Link>
              ) : (
                <span className="text-text-primary">{e.label}</span>
              )}
              <span className="ml-1 text-tiny text-text-tertiary">· {formatRelative(e.at)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
