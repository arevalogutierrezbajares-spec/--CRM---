"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePresence } from "@/lib/presence/presence-context";
import { FOUNDER_DIRECTORY, founderProfileFor } from "@/lib/founder-photos";
import { listFounderLastSeenAction } from "@/app/(app)/team/actions";
import { cn, formatRelative } from "@/lib/utils";

/**
 * Founder presence bubbles for the top bar — always shows all three faces
 * (Tomás, José, Charles); whoever is live on the realtime presence channel
 * gets an emerald ring and a pulsing dot, the rest dim out with a "last seen…"
 * tooltip. Links to the Team page. Hidden on the smallest screens.
 */
export function FounderPresence() {
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

  return (
    <Link
      href="/team"
      aria-label="Team presence"
      className="hidden items-center gap-1.5 rounded-full px-1 py-0.5 transition-colors hover:bg-[var(--accent)] sm:flex"
    >
      <div className="flex -space-x-2">
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
                width={28}
                height={28}
                className={cn(
                  "h-7 w-7 rounded-full border-2 border-[var(--background)] object-cover transition-all",
                  online
                    ? "ring-2 ring-emerald-500"
                    : "opacity-45 grayscale",
                )}
              />
              {online && (
                <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full border-2 border-[var(--background)] bg-emerald-500" />
                </span>
              )}
            </span>
          );
        })}
      </div>
    </Link>
  );
}
