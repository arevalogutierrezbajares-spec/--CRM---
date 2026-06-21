"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePresence } from "@/lib/presence/presence-context";
import { FOUNDER_DIRECTORY, founderProfileFor } from "@/lib/founder-photos";
import { listFounderLastSeenAction } from "@/app/(app)/team/actions";
import { cn, formatRelative } from "@/lib/utils";

/**
 * Founder presence bubbles for the sidebar — always shows all three faces
 * (Tomás, José, Charles). Whoever is live on the realtime presence channel
 * gets an emerald ring + pulsing dot; offline founders dim with a "last seen…"
 * tooltip. `rail` renders a compact vertical stack for the collapsed sidebar.
 */
export function FounderPresence({ rail = false }: { rail?: boolean }) {
  const presence = usePresence();
  const [lastSeen, setLastSeen] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let active = true;
    const load = async () => {
      const rows = await listFounderLastSeenAction().catch(() => []);
      if (!active) return;
      const map: Record<string, string | null> = {};
      for (const r of rows) map[r.name] = r.lastSeenAt;
      setLastSeen(map);
    };
    void load();
    // Refresh last-seen periodically so offline tooltips stay current.
    const id = setInterval(load, 60_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // Map live presence identities to canonical founder names.
  const onlineNames = new Set<string>();
  for (const p of presence?.online ?? []) {
    const founder = founderProfileFor(p.name);
    if (founder) onlineNames.add(founder.displayName);
  }
  const onlineCount = FOUNDER_DIRECTORY.filter((f) =>
    onlineNames.has(f.name),
  ).length;

  const size = rail ? 26 : 28;

  return (
    <Link
      href="/team"
      aria-label="Team presence"
      title="See who's online"
      className={cn(
        "flex items-center rounded-md transition-colors hover:bg-surface",
        rail ? "flex-col gap-1.5 py-1.5" : "gap-2 px-1.5 py-1.5",
      )}
    >
      <div className={cn("flex", rail ? "flex-col gap-1.5" : "-space-x-2")}>
        {FOUNDER_DIRECTORY.map((founder) => {
          const online = onlineNames.has(founder.name);
          const seen = lastSeen[founder.name];
          const firstName = founder.name.split(" ")[0];
          const status = online
            ? `${founder.name} · online now`
            : seen
              ? `${founder.name} · last seen ${formatRelative(seen)}`
              : `${founder.name} · offline`;
          return (
            <span key={founder.name} className="relative" title={status}>
              <Image
                src={founder.photoUrl}
                alt={firstName}
                width={size}
                height={size}
                className={cn(
                  "rounded-full border-2 border-card object-cover transition-all",
                  online ? "ring-2 ring-emerald-500" : "opacity-45 grayscale",
                )}
                style={{ width: size, height: size }}
              />
              {online && (
                <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" />
                </span>
              )}
            </span>
          );
        })}
      </div>
      {!rail && (
        <span className="truncate text-tiny text-text-tertiary">
          {onlineCount > 0 ? `${onlineCount} online` : "Team"}
        </span>
      )}
    </Link>
  );
}
