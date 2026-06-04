"use client";

import Link from "next/link";
import { usePresence } from "@/lib/presence/presence-context";

/** Live avatar stack of who's online, linking to the Team page. */
export function PresenceDots() {
  const presence = usePresence();
  if (!presence || presence.online.length === 0) return null;

  const shown = presence.online.slice(0, 5);

  return (
    <Link
      href="/team"
      className="flex items-center gap-2 border-t px-4 py-2.5 hover:bg-surface transition-colors"
      style={{ borderColor: "var(--border-default)" }}
      title="See who's online"
    >
      <div className="flex -space-x-1.5">
        {shown.map((p) => (
          <span
            key={p.userId}
            title={`${p.name} · ${p.label}`}
            className="grid h-5 w-5 place-items-center rounded-full border border-card text-[9px] font-medium text-white"
            style={{ background: p.color }}
          >
            {p.name.slice(0, 1).toUpperCase()}
          </span>
        ))}
      </div>
      <span className="text-tiny text-text-tertiary">{presence.online.length} online</span>
    </Link>
  );
}
