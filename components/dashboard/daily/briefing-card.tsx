import Link from "next/link";
import { CalendarPlus, Mic, Sparkles, CheckCircle2, type LucideIcon } from "lucide-react";
import { DashCard } from "../shared/dash-card";
import { SectionLabel } from "../shared/section-label";
import { NeedsYouNow } from "./needs-you-now";
import type { BlockedProject } from "@/db/queries/this-week";
import type { DashActionItem, DashMeeting, DashTask } from "@/db/queries/dashboard";

/** The day briefing: AI summary bullets on top + the "Needs you now" urgent lane
 *  beneath (renders only when something is pressing). */
export function BriefingCard({
  bullets,
  actionItems,
  tasks,
  blocked,
  meetings,
  nowMs,
}: {
  bullets: string[];
  actionItems: DashActionItem[];
  tasks: DashTask[];
  blocked: BlockedProject[];
  meetings: DashMeeting[];
  nowMs: number;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <DashCard>
        <SectionLabel icon={Sparkles}>Briefing</SectionLabel>
        {bullets.length === 0 ? (
          <div className="mt-1.5 space-y-2">
            <div className="flex items-center gap-1.5 text-[12.5px] text-text-secondary">
              <CheckCircle2 size={13} className="text-green-mid" />
              Clear runway — nothing pressing right now.
            </div>
            {actionItems.length === 0 && tasks.length === 0 && blocked.length === 0 && meetings.length === 0 && (
              <div className="grid gap-1.5 sm:grid-cols-3">
                <QuickAction href="/meetings/record" icon={Mic} label="Record call" />
                <QuickAction href="/town-hall?extract=1" icon={Sparkles} label="Paste notes" />
                <QuickAction href="/meetings/new" icon={CalendarPlus} label="Create meeting" />
              </div>
            )}
          </div>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[12.5px] text-text-secondary">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--blue-mid)]" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </DashCard>
      <NeedsYouNow actionItems={actionItems} tasks={tasks} blocked={blocked} meetings={meetings} nowMs={nowMs} />
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-[12px] font-medium text-text-secondary transition-colors hover:bg-surface hover:text-text-primary sm:min-h-[36px]"
    >
      <Icon size={14} />
      {label}
    </Link>
  );
}
