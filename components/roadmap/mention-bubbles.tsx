"use client";

/**
 * Renders the @tokens inside roadmap initiative titles as person "bubbles".
 *
 * Mentions live inline in the title text (e.g. "Launch @MariaPerez booking
 * engine") — the same Model-A convention Town Hall uses — so the renderer
 * splits the text on @tokens and styles the ones that resolve to a known
 * workspace member. A bubble click filters the roadmap to that person.
 */

import { useMemo, useState } from "react";
import { UserPlus2, Users } from "lucide-react";
import {
  MENTION_TOKEN_RE,
  buildHandleIndex,
  hasAllMention,
  isAllToken,
  mentionedMembers,
  type MentionMember,
} from "@/lib/roadmap-mentions";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type { MentionMember };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (a + b).toUpperCase() || "?";
}

export function PersonBubble({
  member,
  onClick,
}: {
  member: MentionMember;
  onClick?: (userId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation();
              onClick(member.userId);
            }
          : undefined
      }
      title={onClick ? `Filter roadmap by ${member.displayName}` : member.displayName}
      className="inline-flex items-center gap-1 rounded-full border px-1.5 py-px align-baseline text-[11.5px] font-medium leading-tight"
      style={{
        borderColor: "var(--border-default)",
        background: "var(--blue-bg, rgba(59,130,246,0.10))",
        color: "var(--blue-text)",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <span
        className="grid h-3.5 w-3.5 place-items-center rounded-full text-[8px] text-white"
        style={{ background: "var(--blue-text)" }}
        aria-hidden
      >
        {initials(member.displayName)}
      </span>
      {member.displayName}
    </button>
  );
}

/** `@all` bubble — represents everyone on the team (tooltip lists them). */
export function EveryoneBubble({ members }: { members: MentionMember[] }) {
  const names = members.map((m) => m.displayName).join(", ");
  return (
    <span
      title={members.length ? `Everyone: ${names}` : "Everyone on the team"}
      className="inline-flex items-center gap-1 rounded-full border px-1.5 py-px align-baseline text-[11.5px] font-medium leading-tight"
      style={{
        borderColor: "var(--amber-mid, #b45309)",
        background: "color-mix(in oklab, var(--amber-mid, #b45309) 12%, transparent)",
        color: "var(--amber-mid, #b45309)",
      }}
    >
      <span
        className="grid h-3.5 w-3.5 place-items-center rounded-full"
        style={{ background: "var(--amber-mid, #b45309)" }}
        aria-hidden
      >
        <Users size={9} color="#fff" />
      </span>
      Everyone{members.length ? ` · ${members.length}` : ""}
    </span>
  );
}

/** Render a title with its @tokens turned into person (or @all) bubbles. */
export function MentionText({
  text,
  members,
  onPersonClick,
  className,
}: {
  text: string;
  members: MentionMember[];
  onPersonClick?: (userId: string) => void;
  className?: string;
}) {
  const index = useMemo(() => buildHandleIndex(members), [members]);
  const parts = text.split(MENTION_TOKEN_RE);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.startsWith("@")) {
          if (isAllToken(part)) return <EveryoneBubble key={i} members={members} />;
          const member = index.get(part.slice(1).toLowerCase());
          if (member) {
            return <PersonBubble key={i} member={member} onClick={onPersonClick} />;
          }
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

/**
 * FR-E5 assignment control for an initiative: assigned people render as bubbles
 * only (the title stays plain prose). A "+" opens a searchable picker (with
 * "Everyone"); clicking a bubble opens a menu to reassign to another user, set
 * Everyone, or remove. `people` / `members` are the source of truth
 * (initiative_people) — never parsed from the title.
 */
export function InitiativePeople({
  people,
  members,
  onChange,
  onPersonClick,
}: {
  people: MentionMember[];
  members: MentionMember[];
  onChange: (people: MentionMember[]) => void;
  onPersonClick?: (userId: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState("");
  const assigned = new Set(people.map((p) => p.userId));
  const query = q.trim().toLowerCase();
  const addable = members.filter(
    (m) => !assigned.has(m.userId) && (query === "" || m.displayName.toLowerCase().includes(query)),
  );

  const replace = (oldId: string, m: MentionMember) => {
    const idx = people.findIndex((p) => p.userId === oldId);
    const next = people.filter((p) => p.userId !== oldId && p.userId !== m.userId);
    next.splice(idx < 0 ? next.length : idx, 0, m);
    onChange(next);
  };
  const removeP = (id: string) => onChange(people.filter((p) => p.userId !== id));
  const everyone = () => {
    onChange(members);
    setAddOpen(false);
  };
  const add = (m: MentionMember) => {
    onChange([...people, m]);
    setQ("");
    setAddOpen(false);
  };

  return (
    <span className="flex shrink-0 items-center gap-1">
      {people.map((p) => (
        <DropdownMenu key={p.userId}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={`${p.displayName} — click to reassign or remove`}
              className="inline-flex items-center gap-1 rounded-full border px-1.5 py-px align-baseline text-[11.5px] font-medium leading-tight"
              style={{
                borderColor: "var(--border-default)",
                background: "var(--blue-bg, rgba(59,130,246,0.10))",
                color: "var(--blue-text)",
              }}
            >
              <span
                className="grid h-3.5 w-3.5 place-items-center rounded-full text-[8px] text-white"
                style={{ background: "var(--blue-text)" }}
                aria-hidden
              >
                {initials(p.displayName)}
              </span>
              {p.displayName}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {onPersonClick && (
              <>
                <DropdownMenuItem onClick={() => onPersonClick(p.userId)}>
                  Filter roadmap by {p.displayName.split(/\s+/)[0]}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuLabel>Reassign to</DropdownMenuLabel>
            <div className="max-h-44 overflow-auto">
              {members.filter((m) => m.userId !== p.userId).length === 0 ? (
                <p className="px-2 py-1.5 text-tiny text-text-tertiary">No one else.</p>
              ) : (
                members
                  .filter((m) => m.userId !== p.userId)
                  .map((m) => (
                    <DropdownMenuItem key={m.userId} onClick={() => replace(p.userId, m)}>
                      {m.displayName}
                    </DropdownMenuItem>
                  ))
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={everyone}>Everyone</DropdownMenuItem>
            <DropdownMenuItem onClick={() => removeP(p.userId)} className="text-[var(--red-text)]">
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
      <Popover open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setQ(""); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Assign people"
            aria-label="Assign people to this initiative"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full border text-text-tertiary transition-colors hover:bg-surface hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            style={{ borderColor: "var(--border-default)" }}
          >
            <UserPlus2 size={12} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-52 p-1.5">
          <div className="relative mb-1">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary">@</span>
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="assign…"
              className="h-[34px] pl-6 text-[12px]"
            />
          </div>
          <button
            type="button"
            onClick={everyone}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-text-secondary hover:bg-surface"
          >
            <Users size={13} /> Everyone
          </button>
          <div className="max-h-52 overflow-auto">
            {addable.length === 0 ? (
              <p className="px-2 py-2 text-tiny text-text-tertiary">No one to add.</p>
            ) : (
              addable.map((m) => (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => add(m)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-text-secondary hover:bg-surface"
                >
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--blue-text)] text-[9px] font-semibold text-white">
                    {initials(m.displayName)}
                  </span>
                  {m.displayName}
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
}

/** Compact bubble row, e.g. at the right edge of an always-editable outline row. */
export function PersonChipStack({
  text,
  members,
  onPersonClick,
}: {
  text: string;
  members: MentionMember[];
  onPersonClick?: (userId: string) => void;
}) {
  const tagged = mentionedMembers(text, members);
  const everyone = hasAllMention(text);
  if (!everyone && tagged.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {everyone && <EveryoneBubble members={members} />}
      {tagged.map((m) => (
        <PersonBubble key={m.userId} member={m} onClick={onPersonClick} />
      ))}
    </span>
  );
}
