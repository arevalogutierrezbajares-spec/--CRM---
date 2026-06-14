"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AttendeePicker, type PickerContact } from "@/components/meetings/attendee-picker";

type MeetingType = "one_on_one" | "group" | "event" | "call";

export type MeetingFormInitial = {
  id?: string;
  title?: string;
  scheduledAt?: string; // datetime-local value
  endedAt?: string | null;
  type?: MeetingType;
  location?: string | null;
  agenda?: string | null;
  minutes?: string | null;
  metAtTag?: string | null;
  linkedProjectId?: string | null;
  attendeeIds?: string[];
};

type Action = (formData: FormData) => Promise<unknown>;

export function MeetingForm({
  initial,
  action,
  contacts,
  projects,
  submitLabel = "Save",
}: {
  initial?: MeetingFormInitial;
  action: Action;
  contacts: PickerContact[];
  projects: { id: string; title: string }[];
  submitLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<MeetingType>(initial?.type ?? "one_on_one");
  const [linkedProjectId, setLinkedProjectId] = useState<string>(
    initial?.linkedProjectId ?? "",
  );
  const [attendees, setAttendees] = useState<string[]>(initial?.attendeeIds ?? []);

  return (
    <form
      action={(formData) => {
        setError(null);
        formData.set("type", type);
        if (linkedProjectId) formData.set("linkedProjectId", linkedProjectId);
        else formData.delete("linkedProjectId");
        formData.delete("attendeeId");
        for (const id of attendees) formData.append("attendeeId", id);
        startTransition(async () => {
          try {
            await action(formData);
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save");
          }
        });
      }}
      className="space-y-6"
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            required
            autoFocus
            defaultValue={initial?.title ?? ""}
            placeholder="e.g. Marta — onboarding kickoff"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="minutes">Minutes</Label>
          <Textarea
            id="minutes"
            name="minutes"
            defaultValue={initial?.minutes ?? ""}
            className="min-h-[160px] font-mono text-xs"
            placeholder={`What happened, decisions made, who said what.

Use [ ] action items to spawn milestones:
[ ] Send proposal to Marta
[ ] Confirm vendor pricing`}
          />
        </div>
      </div>

      <section className="space-y-2">
        <Label>Attendees</Label>
        <AttendeePicker
          contacts={contacts}
          value={attendees}
          onChange={setAttendees}
        />
      </section>

      <details
        className="group rounded-lg border border-[var(--border)] bg-[var(--muted)]/10"
      >
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <span>Details</span>
          <span className="text-xs text-[var(--muted-foreground)] transition-transform group-open:rotate-180">
            v
          </span>
        </summary>
        <div className="grid gap-4 border-t border-[var(--border)] p-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="scheduledAt">When</Label>
            <Input
              id="scheduledAt"
              name="scheduledAt"
              type="datetime-local"
              required
              defaultValue={initial?.scheduledAt ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="endedAt">Ended</Label>
            <Input
              id="endedAt"
              name="endedAt"
              type="datetime-local"
              defaultValue={initial?.endedAt ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as MeetingType)}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one_on_one">1:1</SelectItem>
                <SelectItem value="group">Group</SelectItem>
                <SelectItem value="event">Event</SelectItem>
                <SelectItem value="call">Call</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              name="location"
              defaultValue={initial?.location ?? ""}
              placeholder="Caracas · Zoom · WhatsApp"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="linkedProjectId">Linked project</Label>
            <Select
              value={linkedProjectId || "_none"}
              onValueChange={(v) =>
                setLinkedProjectId(v === "_none" ? "" : v)
              }
            >
              <SelectTrigger id="linkedProjectId">
                <SelectValue placeholder="Optional…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">None</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-[var(--muted-foreground)]">
              Action items in minutes become milestones on this project.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="metAtTag">Met-at tag</Label>
            <Input
              id="metAtTag"
              name="metAtTag"
              defaultValue={initial?.metAtTag ?? ""}
              placeholder="IDB-dinner-2026"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="agenda">Agenda</Label>
            <Textarea
              id="agenda"
              name="agenda"
              defaultValue={initial?.agenda ?? ""}
              placeholder="What you want to cover."
            />
          </div>
        </div>
      </details>

      {error && (
        <div className="rounded-md border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 px-3 py-2 text-sm text-[var(--destructive)]">
          {error}
        </div>
      )}

      <div className="sticky bottom-0 -mx-6 flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--card)] px-6 py-3 sm:static sm:mx-0 sm:bg-transparent sm:pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" loading={pending} loadingText="Saving…">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
