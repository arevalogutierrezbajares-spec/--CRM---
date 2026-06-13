"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";

type ChannelKind = "email" | "phone" | "whatsapp" | "instagram" | "domain";

export type ContactFormInitial = {
  id?: string;
  name?: string;
  type?: "person" | "org";
  organization?: string | null;
  relationshipType?: "friend" | "lead" | "partner" | "prospect";
  introChainFromText?: string | null;
  notesPath?: string | null;
  primaryOrgId?: string | null;
  channels?: { kind: ChannelKind; value: string }[];
  tagIds?: string[];
};

export type TagOption = {
  id: string;
  name: string;
  color?: string | null;
  category?: string | null;
};
export type OrgOption = { id: string; name: string };
const UNCATEGORIZED = "Other";

const NO_ORG = "__none__";

type Action = (formData: FormData) => Promise<unknown>;

export function ContactForm({
  initial,
  action,
  availableTags,
  orgOptions = [],
  submitLabel = "Save",
}: {
  initial?: ContactFormInitial;
  action: Action;
  availableTags: TagOption[];
  orgOptions?: OrgOption[];
  submitLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [channels, setChannels] = useState(
    initial?.channels && initial.channels.length > 0
      ? initial.channels
      : [{ kind: "email" as ChannelKind, value: "" }],
  );
  const [selectedTags, setSelectedTags] = useState<Set<string>>(
    new Set(initial?.tagIds ?? []),
  );
  const [orgId, setOrgId] = useState<string>(initial?.primaryOrgId ?? NO_ORG);
  // Don't let a contact link to itself.
  const orgChoices = orgOptions.filter((o) => o.id !== initial?.id);
  const formId = useId();

  // Group the tag chips by category (uncategorized last).
  const tagGroups = (() => {
    const byCat = new Map<string, TagOption[]>();
    for (const t of availableTags) {
      const key = t.category?.trim() || UNCATEGORIZED;
      const arr = byCat.get(key);
      if (arr) arr.push(t);
      else byCat.set(key, [t]);
    }
    return [...byCat.entries()].sort(([a], [b]) => {
      if (a === UNCATEGORIZED) return 1;
      if (b === UNCATEGORIZED) return -1;
      return a.localeCompare(b);
    });
  })();

  function addChannel() {
    setChannels((prev) => [...prev, { kind: "email", value: "" }]);
  }
  function removeChannel(i: number) {
    setChannels((prev) => prev.filter((_, idx) => idx !== i));
  }
  function toggleTag(id: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form
      id={formId}
      action={(formData) => {
        setError(null);
        // Channels and tags are added programmatically (controlled state).
        formData.delete("channel.kind");
        formData.delete("channel.value");
        formData.delete("tagId");
        for (const c of channels) {
          if (c.value.trim()) {
            formData.append("channel.kind", c.kind);
            formData.append("channel.value", c.value);
          }
        }
        for (const id of selectedTags) formData.append("tagId", id);
        formData.set("primaryOrgId", orgId === NO_ORG ? "" : orgId);

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
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            required
            defaultValue={initial?.name ?? ""}
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="type">Type</Label>
          <Select name="type" defaultValue={initial?.type ?? "person"}>
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="person">Person</SelectItem>
              <SelectItem value="org">Organization</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="relationshipType">Relationship</Label>
          <Select
            name="relationshipType"
            defaultValue={initial?.relationshipType ?? "prospect"}
          >
            <SelectTrigger id="relationshipType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="prospect">Prospect</SelectItem>
              <SelectItem value="lead">Lead</SelectItem>
              <SelectItem value="friend">Friend</SelectItem>
              <SelectItem value="partner">Partner</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="organization">Organization</Label>
          <Input
            id="organization"
            name="organization"
            defaultValue={initial?.organization ?? ""}
            placeholder="Optional — Acme Inc., Posada La Rosa…"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="primaryOrg">Part of organization</Label>
          <Select value={orgId} onValueChange={setOrgId}>
            <SelectTrigger id="primaryOrg">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ORG}>None</SelectItem>
              {orgChoices.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-[var(--muted-foreground)]">
            Link this person to an organization contact (its logo and partner room
            carry over).{" "}
            <Link href="/contacts/new?type=org" className="underline hover:text-[var(--foreground)]">
              + New organization
            </Link>
          </p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="introChainFromText">Intro chain (free text)</Label>
          <Input
            id="introChainFromText"
            name="introChainFromText"
            defaultValue={initial?.introChainFromText ?? ""}
            placeholder="e.g. via Carlos at IDB dinner"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="notesPath">Obsidian notes path</Label>
          <Input
            id="notesPath"
            name="notesPath"
            defaultValue={initial?.notesPath ?? ""}
            placeholder="People/Marta Lopez.md"
          />
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Channels</Label>
          <Button type="button" variant="ghost" size="sm" onClick={addChannel}>
            <Plus className="h-4 w-4" /> Add channel
          </Button>
        </div>
        <div className="space-y-2">
          {channels.map((c, i) => (
            <div key={i} className="flex gap-2">
              <Select
                value={c.kind}
                onValueChange={(v) =>
                  setChannels((prev) =>
                    prev.map((ch, idx) =>
                      idx === i ? { ...ch, kind: v as ChannelKind } : ch,
                    ),
                  )
                }
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="domain">Domain</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={c.value}
                onChange={(e) =>
                  setChannels((prev) =>
                    prev.map((ch, idx) =>
                      idx === i ? { ...ch, value: e.target.value } : ch,
                    ),
                  )
                }
                placeholder="marta@example.com"
                className="flex-1"
              />
              {channels.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeChannel(i)}
                  aria-label="Remove channel"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          <p className="text-xs text-[var(--muted-foreground)]">
            First channel of each kind is marked primary automatically.
          </p>
        </div>
      </section>

      {availableTags.length > 0 && (
        <section className="space-y-3">
          <Label>Tags</Label>
          <div className="space-y-3">
            {tagGroups.map(([category, groupTags]) => (
              <div key={category} className="space-y-1.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  {category}
                </p>
                <div className="flex flex-wrap gap-2">
                  {groupTags.map((t) => {
                    const active = selectedTags.has(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTag(t.id)}
                        className="focus:outline-none"
                      >
                        <Badge
                          variant={active ? "default" : "outline"}
                          className="cursor-pointer transition-opacity hover:opacity-80"
                        >
                          {t.name}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
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
