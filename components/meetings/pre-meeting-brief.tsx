import Link from "next/link";
import { formatRelative } from "@/lib/utils";

interface AttendeeContext {
  contactId: string;
  name: string;
  organization: string | null;
  lastTouchAt: Date | null;
  openActionItems: number;
  previousMeetingId: string | null;
  previousMeetingTitle: string | null;
}

interface PreMeetingBriefProps {
  attendees: AttendeeContext[];
}

export function PreMeetingBrief({ attendees }: PreMeetingBriefProps) {
  if (attendees.length === 0) return null;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/10 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
        Pre-meeting brief
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {attendees.map((a) => (
          <AttendeeCard key={a.contactId} {...a} />
        ))}
      </div>
    </div>
  );
}

function AttendeeCard({
  contactId,
  name,
  organization,
  lastTouchAt,
  openActionItems,
  previousMeetingId,
  previousMeetingTitle,
}: AttendeeContext) {
  const touchAge = lastTouchAt ? staleness(lastTouchAt) : "never";
  const touchColor = lastTouchAt ? staleBadgeColor(lastTouchAt) : "text-[var(--muted-foreground)]";

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3 space-y-2">
      <div>
        <Link
          href={`/contacts/${contactId}`}
          className="text-sm font-medium hover:underline"
        >
          {name}
        </Link>
        {organization && (
          <div className="text-xs text-[var(--muted-foreground)]">{organization}</div>
        )}
      </div>

      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[var(--muted-foreground)]">Last touch</span>
          <span className={touchColor}>{touchAge}</span>
        </div>

        {openActionItems > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--muted-foreground)]">Open AIs</span>
            <span className="font-medium text-amber-600 dark:text-amber-400">
              {openActionItems}
            </span>
          </div>
        )}

        {previousMeetingId && previousMeetingTitle && (
          <div className="flex items-start justify-between gap-2">
            <span className="text-[var(--muted-foreground)] shrink-0">Last meeting</span>
            <Link
              href={`/meetings/${previousMeetingId}`}
              className="truncate text-right hover:underline"
              title={previousMeetingTitle}
            >
              {previousMeetingTitle}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function staleness(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function staleBadgeColor(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 7) return "text-green-600 dark:text-green-400";
  if (days <= 30) return "text-amber-600 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}
