import { UsersRound } from "lucide-react";
import { formatRelative } from "@/lib/utils";

type Participant = {
  id: string;
  displayName: string | null;
  roleLabel: string | null;
  lastViewedAt: Date | null;
};

/** Read-only roster of who's signed into the room, shown to guests. */
export function RoomParticipants({
  participants,
  youId,
}: {
  participants: Participant[];
  youId: string | null;
}) {
  if (participants.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex items-center gap-2">
        <UsersRound className="h-4 w-4 text-[var(--muted-foreground)]" />
        <h2 className="text-base font-semibold">In this room</h2>
        <span className="ml-auto text-xs text-[var(--muted-foreground)]">
          {participants.length}
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {participants.map((p) => (
          <li key={p.id} className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--secondary)] text-xs font-medium text-[var(--secondary-foreground)]">
              {(p.displayName ?? "?").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm">
                {p.displayName ?? "Guest"}
                {p.id === youId && (
                  <span className="ml-1 text-xs text-[var(--muted-foreground)]">(you)</span>
                )}
              </div>
              {(p.roleLabel || p.lastViewedAt) && (
                <div className="truncate text-xs text-[var(--muted-foreground)]">
                  {p.roleLabel ?? `active ${formatRelative(p.lastViewedAt as Date)}`}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
