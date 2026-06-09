"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateMeetingFieldsAction } from "@/app/(app)/meetings/actions";
import { MEETING_TZ_LABEL } from "@/lib/date/meeting-time";

type MeetingTypeValue = "one_on_one" | "group" | "event" | "call";

const TYPE_LABELS: Record<MeetingTypeValue, string> = {
  one_on_one: "1:1",
  group: "Group",
  event: "Event",
  call: "Call",
};

const fieldCls =
  "rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-[var(--muted-foreground)] outline-none transition-colors hover:border-[var(--border)] hover:bg-[var(--muted)] focus:border-[var(--border)] focus:bg-[var(--card)] focus:text-[var(--foreground)]";

/**
 * Edit a meeting's core fields inline, directly on the detail page — no Edit
 * button / separate page. Each control saves on blur/change via a single
 * server action, then refreshes so everything downstream (lists, sync) updates.
 */
export function MeetingHeaderEditor({
  meetingId,
  initialTitle,
  initialScheduledInput,
  initialLocation,
  initialType,
  initialLinkedProjectId,
  initialMetAtTag,
  projects,
}: {
  meetingId: string;
  initialTitle: string;
  initialScheduledInput: string;
  initialLocation: string | null;
  initialType: MeetingTypeValue;
  initialLinkedProjectId: string | null;
  initialMetAtTag: string | null;
  projects: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [title, setTitle] = useState(initialTitle);
  const [scheduled, setScheduled] = useState(initialScheduledInput);
  const [location, setLocation] = useState(initialLocation ?? "");
  const [type, setType] = useState<MeetingTypeValue>(initialType);
  const [projectId, setProjectId] = useState(initialLinkedProjectId ?? "");
  const [metAt, setMetAt] = useState(initialMetAtTag ?? "");

  function save(
    patch: Parameters<typeof updateMeetingFieldsAction>[1],
    revert?: () => void,
  ) {
    startTransition(async () => {
      const res = await updateMeetingFieldsAction(meetingId, patch);
      if (res.ok) {
        router.refresh();
      } else {
        toast.error(res.error);
        revert?.();
      }
    });
  }

  return (
    <header className="mt-4 mb-6">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          const t = title.trim();
          if (!t) {
            setTitle(initialTitle);
            return;
          }
          if (t !== initialTitle) save({ title: t }, () => setTitle(initialTitle));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setTitle(initialTitle);
            e.currentTarget.blur();
          }
        }}
        aria-label="Meeting title"
        className="-mx-1.5 w-full rounded-md border border-transparent px-1.5 py-0.5 text-2xl font-semibold tracking-tight outline-none transition-colors hover:border-[var(--border)] focus:border-[var(--border)] focus:bg-[var(--card)]"
      />

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <label className="sr-only" htmlFor="m-when">
          When
        </label>
        <input
          id="m-when"
          type="datetime-local"
          value={scheduled}
          onChange={(e) => {
            setScheduled(e.target.value);
            if (e.target.value)
              save({ scheduledAt: e.target.value }, () =>
                setScheduled(initialScheduledInput),
              );
          }}
          className={fieldCls}
          title={`Scheduled time (${MEETING_TZ_LABEL})`}
        />
        <span className="text-xs text-[var(--muted-foreground)]">
          {MEETING_TZ_LABEL}
        </span>

        <select
          value={type}
          onChange={(e) => {
            const v = e.target.value as MeetingTypeValue;
            setType(v);
            save({ type: v }, () => setType(initialType));
          }}
          className={fieldCls}
          aria-label="Meeting type"
        >
          {(Object.keys(TYPE_LABELS) as MeetingTypeValue[]).map((k) => (
            <option key={k} value={k}>
              {TYPE_LABELS[k]}
            </option>
          ))}
        </select>

        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          onBlur={() => {
            if (location.trim() !== (initialLocation ?? ""))
              save({ location }, () => setLocation(initialLocation ?? ""));
          }}
          placeholder="+ location"
          aria-label="Location"
          className={fieldCls}
        />

        <select
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            save({ linkedProjectId: e.target.value || null }, () =>
              setProjectId(initialLinkedProjectId ?? ""),
            );
          }}
          className={fieldCls}
          aria-label="Linked project"
        >
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>

        <input
          value={metAt}
          onChange={(e) => setMetAt(e.target.value)}
          onBlur={() => {
            if (metAt.trim() !== (initialMetAtTag ?? ""))
              save({ metAtTag: metAt }, () => setMetAt(initialMetAtTag ?? ""));
          }}
          placeholder="+ met-at tag"
          aria-label="Met-at tag"
          className={fieldCls}
        />
      </div>
    </header>
  );
}
