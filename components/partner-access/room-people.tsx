import { formatRelative } from "@/lib/utils";

type Host = { id: string; displayName: string | null; title: string | null };
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

/**
 * "La alianza" — one combined card showing both sides of the partnership: the
 * host team (with roles) and the guests in the room. Client-facing → Spanish.
 */
export function RoomPeople({
  hosts,
  guests,
  youId,
}: {
  hosts: Host[];
  guests: Guest[];
  youId: string | null;
}) {
  if (hosts.length === 0 && guests.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h2 className="text-base font-semibold">La alianza</h2>
      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
        Las personas trabajando juntas en este espacio.
      </p>

      {hosts.length > 0 && (
        <>
          <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            Nuestro equipo
          </p>
          <ul className="mt-1.5 space-y-2.5">
            {hosts.map((m, i) => (
              <li key={m.id} className="flex items-center gap-3">
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold ${ACCENTS[i % ACCENTS.length]}`}
                >
                  {initials(m.displayName)}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {m.displayName ?? "Tu contacto"}
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
            Invitados
          </p>
          <ul className="mt-1.5 space-y-2.5">
            {guests.map((g) => (
              <li key={g.id} className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--secondary)] text-sm font-medium text-[var(--secondary-foreground)]">
                  {initials(g.displayName)}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm">
                    {g.displayName ?? "Invitado"}
                    {g.id === youId && (
                      <span className="ml-1 text-xs text-[var(--muted-foreground)]">(tú)</span>
                    )}
                  </div>
                  {(g.roleLabel || g.lastViewedAt) && (
                    <div className="truncate text-xs text-[var(--muted-foreground)]">
                      {g.roleLabel ?? `activo ${formatRelative(g.lastViewedAt as Date)}`}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
