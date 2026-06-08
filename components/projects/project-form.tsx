"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Status = "active" | "waiting" | "done" | "lost";

export type LobOption = { id: string; title: string };

export type ProjectFormInitial = {
  id?: string;
  lobId?: string;
  title?: string;
  status?: Status;
  dueDate?: string | null;
  waitingOn?: string | null;
  expectedUnblockDate?: string | null;
};

type Action = (formData: FormData) => Promise<unknown>;

export function ProjectForm({
  initial,
  action,
  lobs,
  lobLocked = false,
  submitLabel = "Save",
}: {
  initial?: ProjectFormInitial;
  action: Action;
  lobs: LobOption[];
  lobLocked?: boolean;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(initial?.status ?? "active");
  const [lobId, setLobId] = useState<string>(initial?.lobId ?? "");

  return (
    <form
      action={(formData) => {
        setError(null);
        formData.set("status", status);
        formData.set("lobId", lobId);
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="lobId">Line of business</Label>
          {lobLocked ? (
            <Input
              value={lobs.find((l) => l.id === lobId)?.title ?? "—"}
              disabled
            />
          ) : (
            <Select value={lobId || undefined} onValueChange={setLobId}>
              <SelectTrigger id="lobId">
                <SelectValue placeholder="Choose a line of business…" />
              </SelectTrigger>
              <SelectContent>
                {lobs.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            required
            autoFocus
            defaultValue={initial?.title ?? ""}
            placeholder="e.g. Q2 onboarding sprint"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="waiting">Waiting</SelectItem>
              <SelectItem value="done">Done</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dueDate">Due date</Label>
          <Input
            id="dueDate"
            name="dueDate"
            type="date"
            defaultValue={initial?.dueDate ?? ""}
          />
        </div>

        {status === "waiting" && (
          <>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="waitingOn">Waiting on</Label>
              <Input
                id="waitingOn"
                name="waitingOn"
                required
                defaultValue={initial?.waitingOn ?? ""}
                placeholder="What's holding this up?"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expectedUnblockDate">Expected unblock</Label>
              <Input
                id="expectedUnblockDate"
                name="expectedUnblockDate"
                type="date"
                defaultValue={initial?.expectedUnblockDate ?? ""}
              />
            </div>
          </>
        )}
      </div>

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
