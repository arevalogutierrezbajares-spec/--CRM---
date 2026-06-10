// Note: no email field — a teammate's email must never reach the external
// client (even as an initials fallback). Names only.
type TeamMember = {
  id: string;
  displayName: string | null;
  title: string | null;
};

function initials(name: string | null) {
  const base = name?.trim() || "•";
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

// Text shades darkened to clear WCAG AA (4.5:1) on the light tint.
const ACCENTS = [
  "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200",
  "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200",
];

/** Warm "your team" card shown to the client — circular initials + name + title. */
export function RoomTeamDisplay({ team }: { team: TeamMember[] }) {
  if (team.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h2 className="text-base font-semibold">Your team</h2>
      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
        The people looking after you here.
      </p>
      <ul className="mt-3 space-y-3">
        {team.map((m, i) => (
          <li key={m.id} className="flex items-center gap-3">
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${ACCENTS[i % ACCENTS.length]}`}
            >
              {initials(m.displayName)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{m.displayName ?? "Your contact"}</div>
              {m.title && (
                <div className="truncate text-xs text-[var(--muted-foreground)]">{m.title}</div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
