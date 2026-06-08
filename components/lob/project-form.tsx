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
import { Badge } from "@/components/ui/badge";

type Status = "active" | "waiting" | "done" | "lost";

export type TemplateOption = {
  id: string;
  name: string;
  description: string | null;
  stageCount?: number;
};
export type ContactOption = { id: string; name: string };

export type ProjectFormInitial = {
  id?: string;
  title?: string;
  status?: Status;
  templateId?: string | null;
  contactIds?: string[];
  dueDate?: string | null;
  waitingOn?: string | null;
  expectedUnblockDate?: string | null;
  notesPath?: string | null;
};

type Action = (formData: FormData) => Promise<unknown>;

export function ProjectForm({
  initial,
  action,
  templates,
  contacts,
  submitLabel = "Save",
  templateLocked = false,
}: {
  initial?: ProjectFormInitial;
  action: Action;
  templates: TemplateOption[];
  contacts: ContactOption[];
  submitLabel?: string;
  templateLocked?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(initial?.status ?? "active");
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(
    new Set(initial?.contactIds ?? []),
  );
  const [templateId, setTemplateId] = useState<string>(
    initial?.templateId ?? "",
  );

  function toggleContact(id: string) {
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form
      action={(formData) => {
        setError(null);
        formData.set("status", status);
        if (templateId) formData.set("templateId", templateId);
        else formData.delete("templateId");
        formData.delete("contactId");
        for (const id of selectedContacts) formData.append("contactId", id);
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
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            required
            autoFocus
            defaultValue={initial?.title ?? ""}
            placeholder="e.g. Marta — Caney onboarding"
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
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="templateId">Pipeline template</Label>
          {templateLocked ? (
            <Input
              value={
                templates.find((t) => t.id === templateId)?.name ?? "No template"
              }
              disabled
            />
          ) : (
            <Select
              value={templateId || "_none"}
              onValueChange={(v) => setTemplateId(v === "_none" ? "" : v)}
            >
              <SelectTrigger id="templateId">
                <SelectValue placeholder="Choose template…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">No template</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {typeof t.stageCount === "number"
                      ? ` · ${t.stageCount} stages`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!templateLocked && (
            <p className="text-xs text-[var(--muted-foreground)]">
              Choosing a template instantiates one milestone per stage with due
              dates from each stage&apos;s SLA.
            </p>
          )}
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

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="notesPath">Obsidian notes path</Label>
          <Input
            id="notesPath"
            name="notesPath"
            defaultValue={initial?.notesPath ?? ""}
            placeholder="Projects/Marta Caney.md"
          />
        </div>
      </div>

      {contacts.length > 0 && (
        <section className="space-y-3">
          <Label>Linked contacts</Label>
          <div className="flex flex-wrap gap-2">
            {contacts.map((c) => {
              const active = selectedContacts.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleContact(c.id)}
                  className="focus:outline-none"
                >
                  <Badge
                    variant={active ? "default" : "outline"}
                    className="cursor-pointer transition-opacity hover:opacity-80"
                  >
                    {c.name}
                  </Badge>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            First selected contact becomes the primary; others are linked.
          </p>
        </section>
      )}

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
