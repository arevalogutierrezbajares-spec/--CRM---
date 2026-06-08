import Link from "next/link";
import {
  CheckCircle2,
  FileText,
  FolderGit2,
  Link2,
  ListTodo,
  MessageSquareText,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { formatRelative } from "@/lib/utils";
import type { ActivityEntity, ActivityEvent } from "@/db/queries/activity";

const ENTITY_ICON: Record<ActivityEntity, LucideIcon> = {
  doc: FileText,
  file: FileText,
  link: Link2,
  note: StickyNote,
  project: FolderGit2,
  contact: FolderGit2,
  meeting: MessageSquareText,
  touch: MessageSquareText,
  milestone: ListTodo,
  action_item: ListTodo,
  initiative: FolderGit2,
};

/** "Latest updates + who made them" log for the project Overview tab. */
export function ProjectActivityLog({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="py-3 text-tiny text-text-tertiary">
        No activity yet. Tasks, docs and touches will show up here as they happen.
      </p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {events.map((e) => {
        const Icon = e.done ? CheckCircle2 : ENTITY_ICON[e.entity] ?? StickyNote;
        const row = (
          <div className="flex items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-surface">
            <Icon
              size={14}
              className={`mt-0.5 shrink-0 ${e.done ? "text-green-mid" : "text-text-tertiary"}`}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] leading-snug text-text-secondary">
                <span className="font-medium text-text-primary">
                  {e.actorName ?? "Someone"}
                </span>{" "}
                {e.verb}{" "}
                <span className="text-text-primary">{e.label}</span>
              </div>
              <div className="text-tiny text-text-tertiary">{formatRelative(e.at)}</div>
            </div>
          </div>
        );
        return (
          <li key={e.id}>
            {e.href ? (
              <Link href={e.href} className="block">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}
