import { formatRelative } from "@/lib/utils";

type DateIsh = Date | string | null | undefined;

function toDate(value: DateIsh): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysSince(d: Date | null): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Recency cell: shows the latest of (real outreach touch, profile edit) so the
 * column answers "when did anything last happen with this person". The
 * staleness dot stays keyed to the REAL touch — an edit must never make an
 * un-contacted relationship look fresh.
 */
export function LastTouchCell({
  touchedAt,
  editedAt,
}: {
  /** Last real interaction (meeting sync, manual touch, WhatsApp/email/voice). */
  touchedAt: DateIsh;
  /** Last profile edit in the CRM (contacts.updatedAt). */
  editedAt?: DateIsh;
}) {
  const touched = toDate(touchedAt);
  const edited = toDate(editedAt);
  const editWins = !!edited && (!touched || edited.getTime() > touched.getTime());
  const shown = editWins ? edited : touched;

  // Dot/severity from the real touch only.
  const touchDays = daysSince(touched);
  let dotClass = "bg-[var(--muted-foreground)]/30";
  let textClass = "text-[var(--muted-foreground)]";
  let touchLabel = "Never contacted";

  if (touchDays !== null && touchDays >= 0) {
    if (touchDays < 7) {
      dotClass = "bg-emerald-500";
      textClass = "text-emerald-700 dark:text-emerald-400";
      touchLabel = `Last touch ${touchDays}d ago — fresh`;
    } else if (touchDays < 30) {
      dotClass = "bg-amber-500";
      textClass = "text-amber-700 dark:text-amber-400";
      touchLabel = `Last touch ${touchDays}d ago — getting stale`;
    } else {
      dotClass = "bg-red-500";
      textClass = "text-red-700 dark:text-red-400";
      touchLabel = `Last touch ${touchDays}d ago — needs attention`;
    }
  }

  const title = editWins
    ? `Profile edited ${daysSince(edited)}d ago · ${touchLabel.charAt(0).toLowerCase()}${touchLabel.slice(1)}`
    : touchLabel;

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={title}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      <span className={`text-xs ${editWins ? "text-[var(--muted-foreground)]" : textClass}`}>
        {formatRelative(shown)}
        {editWins && <span className="text-[var(--muted-foreground)]/70"> · edited</span>}
      </span>
    </span>
  );
}
