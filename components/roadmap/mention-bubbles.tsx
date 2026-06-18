"use client";

/**
 * Renders the @tokens inside roadmap initiative titles as person "bubbles".
 *
 * Mentions live inline in the title text (e.g. "Launch @MariaPerez booking
 * engine") — the same Model-A convention Town Hall uses — so the renderer
 * splits the text on @tokens and styles the ones that resolve to a known
 * workspace member. A bubble click filters the roadmap to that person.
 */

import { useMemo } from "react";
import { Users } from "lucide-react";
import {
  MENTION_TOKEN_RE,
  buildHandleIndex,
  hasAllMention,
  isAllToken,
  mentionedMembers,
  type MentionMember,
} from "@/lib/roadmap-mentions";

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
