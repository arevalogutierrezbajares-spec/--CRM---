import { Sparkles, CheckCircle2 } from "lucide-react";
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
          <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-text-secondary">
            <CheckCircle2 size={13} className="text-green-mid" />
            Clear runway — nothing pressing right now.
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
