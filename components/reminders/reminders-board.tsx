"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  CalendarClock,
  Check,
  Pin,
  PinOff,
  Plus,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { formatDateTime, formatRelative } from "@/lib/utils";
import {
  createSharedReminder,
  deleteSharedReminder,
  toggleReminderDone,
  toggleReminderPin,
} from "@/app/(app)/reminders/actions";
import type { SharedReminderItem } from "@/db/queries/shared-reminders";

type TagOpt = { id: string; name: string; color: string | null };
type ContactOpt = { id: string; name: string };

export function RemindersBoard({
  reminders,
  allTags,
  contacts,
}: {
  reminders: SharedReminderItem[];
  allTags: TagOpt[];
  contacts: ContactOpt[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState(reminders);
  // Reconcile with server props after each revalidate: when a fresh `reminders`
  // array arrives (new reference post-refresh), adopt it as the new baseline.
  // Adjusting state during render (React's documented pattern) — no effect.
  const [prevReminders, setPrevReminders] = useState(reminders);
  if (reminders !== prevReminders) {
    setPrevReminders(reminders);
    setItems(reminders);
  }
  // One stable "now" for overdue comparison (impure Date read kept out of render).
  const [nowMs] = useState(() => Date.now());

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [due, setDue] = useState("");
  const [chosenTags, setChosenTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [chosenContacts, setChosenContacts] = useState<ContactOpt[]>([]);

  const open = items.filter((r) => !r.doneAt);
  const done = items.filter((r) => r.doneAt);

  function addTag(name: string) {
    const n = name.trim();
    if (!n) return;
    setChosenTags((prev) => (prev.includes(n) ? prev : [...prev, n]));
    setTagDraft("");
  }
  function addContact(id: string) {
    const c = contacts.find((x) => x.id === id);
    if (!c) return;
    setChosenContacts((prev) => (prev.some((x) => x.id === id) ? prev : [...prev, c]));
  }
  function resetForm() {
    setTitle("");
    setBody("");
    setDue("");
    setChosenTags([]);
    setTagDraft("");
    setChosenContacts([]);
  }

  function submit() {
    const t = title.trim();
    if (!t) {
      toast.error("Add reminder text first");
      return;
    }
    const payload = {
      title: t,
      body: body.trim() || null,
      dueAt: due || null,
      tags: chosenTags,
      contactIds: chosenContacts.map((c) => c.id),
    };
    resetForm();
    startTransition(async () => {
      const res = await createSharedReminder(payload);
      if (res.ok) {
        toast.success("Reminder posted to the board");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function setDoneState(r: SharedReminderItem, isDone: boolean) {
    setItems((prev) =>
      prev.map((x) => (x.id === r.id ? { ...x, doneAt: isDone ? new Date() : null } : x)),
    );
    startTransition(async () => {
      const res = await toggleReminderDone({ id: r.id, done: isDone });
      if (!res.ok) toast.error(res.error);
      router.refresh();
    });
  }
  function setPinned(r: SharedReminderItem, pinned: boolean) {
    setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, pinned } : x)));
    startTransition(async () => {
      const res = await toggleReminderPin({ id: r.id, pinned });
      if (!res.ok) toast.error(res.error);
      router.refresh();
    });
  }
  function remove(r: SharedReminderItem) {
    setItems((prev) => prev.filter((x) => x.id !== r.id));
    startTransition(async () => {
      const res = await deleteSharedReminder({ id: r.id });
      if (res.ok) toast.success("Reminder removed");
      else toast.error(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* ── Composer ───────────────────────────────────────────────── */}
      <DashCard>
        <div className="space-y-2.5">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What should the team remember?"
            aria-label="Reminder text"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
          />
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add details (optional)…"
            aria-label="Reminder details"
            rows={2}
          />

          <div className="flex flex-wrap items-center gap-3">
            {/* Due date */}
            <label className="flex items-center gap-1.5 text-tiny text-text-tertiary">
              <CalendarClock size={13} />
              <input
                type="datetime-local"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                aria-label="Due date"
                className="rounded-md border bg-card px-2 py-1 text-[12px] text-text-primary outline-none"
                style={{ borderColor: "var(--border-default)" }}
              />
            </label>

            {/* Contacts picker */}
            {contacts.length > 0 && (
              <label className="flex items-center gap-1.5 text-tiny text-text-tertiary">
                <UserRound size={13} />
                <select
                  value=""
                  onChange={(e) => e.target.value && addContact(e.target.value)}
                  aria-label="Connect a person"
                  className="rounded-md border bg-card px-2 py-1 text-[12px] text-text-primary outline-none"
                  style={{ borderColor: "var(--border-default)" }}
                >
                  <option value="">Connect a person…</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {/* Tag input */}
          <div>
            <input
              list="reminder-tags"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag(tagDraft);
                }
              }}
              placeholder="Add a tag and press Enter…"
              aria-label="Add a tag"
              className="w-full rounded-md border bg-card px-2 py-1 text-[12px] text-text-primary outline-none placeholder:text-text-tertiary"
              style={{ borderColor: "var(--border-default)" }}
            />
            <datalist id="reminder-tags">
              {allTags.map((t) => (
                <option key={t.id} value={t.name} />
              ))}
            </datalist>
          </div>

          {/* Chips for the to-be-created reminder */}
          {(chosenTags.length > 0 || chosenContacts.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {chosenTags.map((t) => (
                <Chip key={`t-${t}`} onRemove={() => setChosenTags((p) => p.filter((x) => x !== t))}>
                  #{t}
                </Chip>
              ))}
              {chosenContacts.map((c) => (
                <Chip
                  key={`c-${c.id}`}
                  onRemove={() => setChosenContacts((p) => p.filter((x) => x.id !== c.id))}
                >
                  <UserRound size={10} /> {c.name}
                </Chip>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" onClick={submit} loading={pending} disabled={!title.trim()}>
              <Plus size={14} /> Post reminder
            </Button>
          </div>
        </div>
      </DashCard>

      {/* ── Open ───────────────────────────────────────────────────── */}
      <Section label={`Open (${open.length})`}>
        {open.length === 0 ? (
          <Empty>Nothing on the board. Post the first reminder above.</Empty>
        ) : (
          open.map((r) => (
            <ReminderCard
              key={r.id}
              r={r}
              nowMs={nowMs}
              onToggleDone={() => setDoneState(r, true)}
              onTogglePin={() => setPinned(r, !r.pinned)}
              onRemove={() => remove(r)}
            />
          ))
        )}
      </Section>

      {/* ── Done ───────────────────────────────────────────────────── */}
      {done.length > 0 && (
        <Section label={`Done (${done.length})`}>
          {done.map((r) => (
            <ReminderCard
              key={r.id}
              r={r}
              nowMs={nowMs}
              onToggleDone={() => setDoneState(r, false)}
              onTogglePin={() => setPinned(r, !r.pinned)}
              onRemove={() => remove(r)}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function ReminderCard({
  r,
  nowMs,
  onToggleDone,
  onTogglePin,
  onRemove,
}: {
  r: SharedReminderItem;
  nowMs: number;
  onToggleDone: () => void;
  onTogglePin: () => void;
  onRemove: () => void;
}) {
  const isDone = !!r.doneAt;
  const overdue = !isDone && r.dueAt && r.dueAt.getTime() < nowMs;
  return (
    <div
      className={`group flex items-start gap-3 rounded-lg border bg-card px-3 py-2.5 ${isDone ? "opacity-60" : ""}`}
      style={{ borderColor: "var(--border-default)" }}
    >
      <button
        type="button"
        onClick={onToggleDone}
        aria-label={isDone ? "Mark not done" : "Mark done"}
        className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors ${
          isDone ? "bg-green-mid text-white" : "hover:bg-surface"
        }`}
        style={{ borderColor: isDone ? "var(--green-mid)" : "var(--border-default)" }}
      >
        {isDone && <Check size={12} />}
      </button>

      <div className="min-w-0 flex-1">
        <div
          className={`text-[13.5px] leading-snug text-text-primary ${isDone ? "line-through" : ""}`}
        >
          {r.title}
        </div>
        {r.body && <p className="mt-0.5 text-[12px] text-text-secondary">{r.body}</p>}

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {r.dueAt && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                overdue ? "bg-red-bg text-red-text" : "bg-surface text-text-secondary"
              }`}
            >
              <CalendarClock size={10} />
              {overdue ? "overdue · " : ""}
              {formatDateTime(r.dueAt)}
            </span>
          )}
          {r.tags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                background: t.color
                  ? `color-mix(in oklab, ${t.color} 20%, transparent)`
                  : "var(--surface)",
                color: t.color ?? "var(--text-secondary)",
              }}
            >
              #{t.name}
            </span>
          ))}
          {r.contacts.map((c) => (
            <Link
              key={c.id}
              href={`/contacts/${c.id}`}
              className="inline-flex items-center gap-1 rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-medium text-text-secondary hover:text-text-primary"
            >
              <UserRound size={10} />
              {c.name}
            </Link>
          ))}
        </div>

        <div className="mt-1 text-tiny text-text-tertiary">
          {r.authorName ?? "Someone"} · {formatRelative(r.createdAt)}
          {r.pinned && " · pinned"}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <button
          type="button"
          onClick={onTogglePin}
          title={r.pinned ? "Unpin" : "Pin to top"}
          aria-label={r.pinned ? "Unpin reminder" : "Pin reminder"}
          className="grid h-7 w-7 place-items-center rounded-md text-text-tertiary hover:bg-surface hover:text-text-primary"
        >
          {r.pinned ? <PinOff size={13} /> : <Pin size={13} />}
        </button>
        <button
          type="button"
          onClick={onRemove}
          title="Delete"
          aria-label="Delete reminder"
          className="grid h-7 w-7 place-items-center rounded-md text-text-tertiary hover:bg-surface hover:text-red-text"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-tiny font-semibold uppercase tracking-wide text-text-tertiary">{label}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border border-dashed px-3 py-6 text-center text-[12px] text-text-tertiary"
      style={{ borderColor: "var(--border-default)" }}
    >
      {children}
    </div>
  );
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[11px] text-text-secondary">
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove"
        className="text-text-tertiary hover:text-text-primary"
      >
        <X size={11} />
      </button>
    </span>
  );
}
