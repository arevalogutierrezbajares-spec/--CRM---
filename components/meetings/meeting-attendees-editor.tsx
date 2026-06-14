"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, UserPlus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRelative } from "@/lib/utils";
import {
  addMeetingAttendeeAction,
  removeMeetingAttendeeAction,
  createContactForMeetingAction,
} from "@/app/(app)/meetings/actions";

type RelationshipType = "friend" | "lead" | "partner" | "prospect";

export type AttendeeContact = {
  id: string;
  name: string;
  organization: string | null;
  relationshipType: RelationshipType;
};

export type ContactOption = {
  id: string;
  name: string;
  organization: string | null;
};

export type ContactTouch = {
  id: string;
  contactId: string;
  channel: string;
  body: string;
  createdAt: string | Date;
};

export function MeetingAttendeesEditor({
  meetingId,
  attendees,
  allContacts,
  recentByContact,
}: {
  meetingId: string;
  attendees: AttendeeContact[];
  allContacts: ContactOption[];
  recentByContact: Record<string, ContactTouch[]>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [added, setAdded] = useState<AttendeeContact[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Reconcile props with optimistic add/remove so it stays live + instant.
  const display = useMemo(() => {
    const seen = new Set<string>();
    const out: AttendeeContact[] = [];
    for (const a of attendees) {
      if (removed.has(a.id) || seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
    }
    for (const a of added) {
      if (removed.has(a.id) || seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
    }
    return out;
  }, [attendees, added, removed]);

  const attendeeIds = useMemo(() => new Set(display.map((a) => a.id)), [display]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allContacts
      .filter(
        (c) =>
          !attendeeIds.has(c.id) &&
          (c.name.toLowerCase().includes(q) ||
            (c.organization ?? "").toLowerCase().includes(q)),
      )
      .slice(0, 6);
  }, [query, allContacts, attendeeIds]);

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allContacts.some((c) => c.name.toLowerCase() === q);
  }, [query, allContacts]);

  function addExisting(c: ContactOption) {
    if (attendeeIds.has(c.id)) return;
    setAdded((a) => [
      ...a,
      { id: c.id, name: c.name, organization: c.organization, relationshipType: "prospect" },
    ]);
    setRemoved((r) => {
      if (!r.has(c.id)) return r;
      const n = new Set(r);
      n.delete(c.id);
      return n;
    });
    setQuery("");
    startTransition(async () => {
      const res = await addMeetingAttendeeAction(meetingId, c.id);
      if (res.ok) router.refresh();
      else {
        toast.error(res.error);
        setAdded((a) => a.filter((x) => x.id !== c.id));
      }
    });
  }

  function remove(id: string) {
    setRemoved((r) => new Set(r).add(id));
    setAdded((a) => a.filter((x) => x.id !== id));
    startTransition(async () => {
      const res = await removeMeetingAttendeeAction(meetingId, id);
      if (res.ok) router.refresh();
      else {
        toast.error(res.error);
        setRemoved((r) => {
          const n = new Set(r);
          n.delete(id);
          return n;
        });
      }
    });
  }

  return (
    <div className="space-y-3">
      {display.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          No attendees yet. Search to add people from your CRM.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {display.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--muted)]/40 py-1 pl-1 pr-1 text-sm"
            >
              <Link
                href={`/contacts/${c.id}`}
                title={`${c.name}${c.organization ? ` · ${c.organization}` : ""} — open profile`}
                className="flex items-center gap-1.5 rounded-full"
              >
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[var(--primary)]/15 text-xs font-semibold text-[var(--primary)]">
                  {initial(c.name)}
                </span>
                <span className="max-w-[160px] truncate font-medium hover:underline">
                  {c.name}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => remove(c.id)}
                aria-label={`Remove ${c.name}`}
                className="grid h-5 w-5 flex-none place-items-center rounded-full text-[var(--muted-foreground)] transition hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Recent CRM activity for these attendees — two-way context, tucked away. */}
      {display.some((c) => (recentByContact[c.id] ?? []).length > 0) && (
        <details className="group rounded-md border border-[var(--border)] bg-[var(--muted)]/10">
          <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-medium text-[var(--muted-foreground)] [&::-webkit-details-marker]:hidden">
            Recent activity
            <span className="transition-transform group-open:rotate-180">v</span>
          </summary>
          <div className="space-y-3 border-t border-[var(--border)] p-3">
            {display.map((c) => {
              const recent = recentByContact[c.id] ?? [];
              if (recent.length === 0) return null;
              return (
                <div key={c.id}>
                  <Link
                    href={`/contacts/${c.id}`}
                    className="text-xs font-medium hover:underline"
                  >
                    {c.name}
                  </Link>
                  <ul className="mt-1 space-y-0.5 border-l border-[var(--border)] pl-2.5">
                    {recent.map((t) => (
                      <li
                        key={t.id}
                        className="truncate text-xs text-[var(--muted-foreground)]"
                        title={t.body}
                      >
                        <span className="text-[var(--foreground)]/70">
                          {firstLine(t.body)}
                        </span>{" "}
                        · {formatRelative(t.createdAt)}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Search / add */}
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add attendee — search your CRM…"
          className="text-sm"
        />
        {query.trim() && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-[var(--border)] bg-[var(--card)] shadow-lg">
            {matches.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => addExisting(c)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--muted)]"
              >
                <Plus className="h-3.5 w-3.5 flex-none text-[var(--muted-foreground)]" />
                <span className="min-w-0 flex-1 truncate">
                  {c.name}
                  {c.organization ? (
                    <span className="text-[var(--muted-foreground)]">
                      {" "}
                      · {c.organization}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
            {!exactMatch && (
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="flex w-full items-center gap-2 border-t border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-[var(--muted)]"
              >
                <UserPlus className="h-3.5 w-3.5 flex-none text-[var(--blue-text)]" />
                <span className="truncate">
                  Add <span className="font-medium">“{query.trim()}”</span> to your
                  CRM
                </span>
              </button>
            )}
            {matches.length === 0 && exactMatch && (
              <p className="px-3 py-2 text-xs text-[var(--muted-foreground)]">
                Already an attendee.
              </p>
            )}
          </div>
        )}
      </div>

      <AddContactDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultName={query.trim()}
        onCreated={(contact) => {
          setAdded((a) => [...a, contact]);
          setQuery("");
          setDialogOpen(false);
          router.refresh();
        }}
        meetingId={meetingId}
      />
    </div>
  );
}

function firstLine(body: string): string {
  const line = body.split("\n").find((l) => l.trim()) ?? body;
  return line.length > 60 ? `${line.slice(0, 60)}…` : line;
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function AddContactDialog({
  open,
  onOpenChange,
  defaultName,
  onCreated,
  meetingId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultName: string;
  onCreated: (c: AttendeeContact) => void;
  meetingId: string;
}) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [relationshipType, setRelationshipType] =
    useState<RelationshipType>("prospect");
  const [pending, startTransition] = useTransition();

  // Keep the name field in sync with whatever was typed in the search box.
  if (open && name === "" && defaultName) setName(defaultName);

  function submit() {
    const n = name.trim();
    if (!n) {
      toast.error("Name is required");
      return;
    }
    startTransition(async () => {
      const res = await createContactForMeetingAction(meetingId, {
        name: n,
        email: email.trim() || undefined,
        organization: organization.trim() || undefined,
        relationshipType,
      });
      if (res.ok) {
        toast.success(`Added ${res.contact.name} to your CRM`);
        onCreated(res.contact);
        setName("");
        setEmail("");
        setOrganization("");
        setRelationshipType("prospect");
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add contact to your CRM</DialogTitle>
          <DialogDescription>
            Creates a new contact and adds them to this meeting.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Email (optional)</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">
              Organization (optional)
            </label>
            <Input
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">Relationship</label>
            <select
              value={relationshipType}
              onChange={(e) =>
                setRelationshipType(e.target.value as RelationshipType)
              }
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 py-2 text-sm"
            >
              <option value="prospect">Prospect</option>
              <option value="lead">Lead</option>
              <option value="partner">Partner</option>
              <option value="friend">Friend</option>
            </select>
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={pending}>
            <UserPlus className="h-4 w-4" /> Add to CRM
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
