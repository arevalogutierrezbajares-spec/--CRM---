"use client";

import { useRoomI18n } from "@/components/partner-access/room-i18n";

type Host = {
  id: string;
  displayName: string | null;
  title: string | null;
  photoUrl?: string | null;
};
type Guest = {
  id: string;
  displayName: string | null;
  roleLabel: string | null;
  lastViewedAt: Date | null;
};

function initials(name: string | null) {
  const base = name?.trim() || "•";
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

const ACCENTS = [
  "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200",
  "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200",
];

// A heartbeat lands every 60s from open tabs; allow a couple of missed beats.
const ONLINE_WINDOW_MS = 2.5 * 60 * 1000;

/**
 * "La alianza" — one combined card showing both sides of the partnership: the
 * host team (with roles) and the guests in the room. Client-facing → Spanish.
 * Guests whose presence heartbeat is fresh show "en línea ahora" with the
 * same green pulse as the hero's "Actualizado" dot.
 */
export function RoomPeople({
  hosts,
  guests,
  youId,
  nowMs,
}: {
  hosts: Host[];
  guests: Guest[];
  youId: string | null;
  nowMs?: number;
}) {
  const { t, rel } = useRoomI18n();
  if (hosts.length === 0 && guests.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h2 className="text-base font-semibold">{t.people.title}</h2>
      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
        {t.people.subtitle}
      </p>

      {hosts.length > 0 && (
        <>
          <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            {t.people.team}
          </p>
          <ul className="mt-1.5 space-y-2.5">
            {hosts.map((m, i) => (
              <li key={m.id} className="flex items-center gap-3">
                {m.photoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={m.photoUrl}
                    alt={m.displayName ?? t.people.teamPhotoAlt}
                    className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-[var(--border)]"
                  />
                ) : (
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${ACCENTS[i % ACCENTS.length]}`}
                  >
                    {initials(m.displayName)}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {m.displayName ?? t.people.contactFallback}
                  </div>
                  {m.title && (
                    <div className="truncate text-xs text-[var(--muted-foreground)]">{m.title}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {guests.length > 0 && (
        <>
          <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            {t.people.guests}
          </p>
          <ul className="mt-1.5 space-y-2.5">
            {guests.map((g) => {
              const online =
                nowMs !== undefined &&
                g.lastViewedAt !== null &&
                nowMs - g.lastViewedAt.getTime() < ONLINE_WINDOW_MS;
              return (
                <li key={g.id} className="flex items-center gap-3">
                  <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--secondary)] text-sm font-medium text-[var(--secondary-foreground)]">
                    {initials(g.displayName)}
                    {online && (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5"
                        aria-hidden
                      >
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[var(--card)]" />
                      </span>
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm">
                      {g.displayName ?? t.people.guestFallback}
                      {g.id === youId && (
                        <span className="ml-1 text-xs text-[var(--muted-foreground)]">
                          {t.people.youParen}
                        </span>
                      )}
                    </div>
                    {(g.roleLabel || g.lastViewedAt || online) && (
                      <div
                        className={`truncate text-xs ${
                          online
                            ? "font-medium text-emerald-600 dark:text-emerald-400"
                            : "text-[var(--muted-foreground)]"
                        }`}
                      >
                        {online
                          ? t.people.onlineNow
                          : g.roleLabel ??
                            t.people.activeAgo(rel(g.lastViewedAt as Date))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
