"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  MonitorPlay,
  Plus,
  Presentation,
  Share2,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  attachMeetingMaterial,
  detachMeetingMaterial,
  reorderMeetingMaterialsAction,
  shareMeetingMaterialsAction,
} from "@/app/(app)/meetings/actions";
import type {
  MeetingMaterial,
  AttachableMaterial,
  MaterialKind,
} from "@/db/queries/meeting-materials";
import {
  materialType,
  materialTypeLabel,
  MATERIAL_TYPE_ORDER,
  type MaterialTypeKey,
} from "@/lib/materials/material-type";

function kindIcon(kind: MaterialKind) {
  switch (kind) {
    case "doc":
      return <FileText className="h-4 w-4" />;
    case "file":
      return <Presentation className="h-4 w-4" />;
    case "link":
      return <Link2 className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
}

export type MeetingAttendee = {
  id: string;
  name: string;
  organization: string | null;
};

export function MeetingMaterials({
  meetingId,
  materials,
  attachable,
  attendees,
}: {
  meetingId: string;
  materials: MeetingMaterial[];
  attachable: AttachableMaterial[];
  attendees: MeetingAttendee[];
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Optimistic id order + optimistic add/remove sets, all reconciled with the
  // live `materials` prop on every render. This makes attach/detach/reorder feel
  // instant AND ensures a server refresh (router.refresh) surfaces changes
  // without a full page reload — the old code seeded `order` from props once and
  // never reconciled, so newly-attached materials never showed until reload.
  const [order, setOrder] = useState<string[]>(() =>
    materials.map((m) => m.projectLinkId),
  );
  const [pendingAdds, setPendingAdds] = useState<MeetingMaterial[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());

  // Live rows + optimistic rows the server hasn't returned yet (live wins).
  const byId = useMemo(() => {
    const m = new Map(materials.map((mm) => [mm.projectLinkId, mm]));
    for (const p of pendingAdds) if (!m.has(p.projectLinkId)) m.set(p.projectLinkId, p);
    return m;
  }, [materials, pendingAdds]);

  // Render order: optimistic order first, then any material in props not yet in
  // `order` (server-added after a refresh), minus anything optimistically removed.
  const ordered = useMemo(() => {
    const seen = new Set<string>();
    const out: MeetingMaterial[] = [];
    const push = (id: string) => {
      if (seen.has(id) || removedIds.has(id)) return;
      const m = byId.get(id);
      if (m) {
        out.push(m);
        seen.add(id);
      }
    };
    for (const id of order) push(id);
    for (const id of byId.keys()) push(id);
    return out;
  }, [order, byId, removedIds]);

  const attachedIds = useMemo(
    () => new Set(ordered.map((m) => m.projectLinkId)),
    [ordered],
  );

  function attach(material: AttachableMaterial) {
    const id = material.projectLinkId;
    if (attachedIds.has(id)) return;
    // Render it immediately; the refresh reconciles with the real server row.
    const optimisticRow: MeetingMaterial = {
      projectLinkId: id,
      sortOrder: order.length,
      kind: material.kind,
      label: material.label,
      url: material.url,
      description: null,
      category: material.category,
      storagePath: null,
      mimeType: material.mimeType,
      sizeBytes: null,
      originalFilename: material.originalFilename,
      lobId: material.lobId,
      lobTitle: material.lobTitle,
    };
    setRemovedIds((s) => {
      if (!s.has(id)) return s;
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    setPendingAdds((p) =>
      p.some((x) => x.projectLinkId === id) ? p : [...p, optimisticRow],
    );
    setOrder((o) => (o.includes(id) ? o : [...o, id]));
    startTransition(async () => {
      const res = await attachMeetingMaterial(meetingId, id);
      if (res.ok) {
        toast.success("Material added");
        router.refresh();
      } else {
        toast.error(res.error);
        setOrder((o) => o.filter((x) => x !== id));
        setPendingAdds((p) => p.filter((x) => x.projectLinkId !== id));
      }
    });
  }

  function detach(projectLinkId: string) {
    setRemovedIds((s) => new Set(s).add(projectLinkId));
    setOrder((o) => o.filter((id) => id !== projectLinkId));
    setPendingAdds((p) => p.filter((x) => x.projectLinkId !== projectLinkId));
    startTransition(async () => {
      const res = await detachMeetingMaterial(meetingId, projectLinkId);
      if (res.ok) {
        toast.success("Material removed");
        router.refresh();
      } else {
        toast.error(res.error);
        setRemovedIds((s) => {
          const n = new Set(s);
          n.delete(projectLinkId);
          return n;
        });
        router.refresh();
      }
    });
  }

  function move(index: number, dir: -1 | 1) {
    const ids = ordered.map((m) => m.projectLinkId);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setOrder(ids);
    startTransition(async () => {
      await reorderMeetingMaterialsAction(meetingId, ids);
      router.refresh();
    });
  }

  const presentHref = `/present/${meetingId}`;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <MonitorPlay className="h-4 w-4 text-[var(--muted-foreground)]" />
          <h2 className="text-sm font-semibold">Materials</h2>
          {ordered.length > 0 && (
            <Badge variant="outline">{ordered.length}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPickerOpen(true)}
            disabled={pending}
          >
            <Plus className="h-4 w-4" /> Add
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShareOpen(true)}
            disabled={ordered.length === 0}
            title="Send these materials to a client as a private link"
          >
            <Share2 className="h-4 w-4" /> Share
          </Button>
          <Button
            asChild
            size="sm"
            variant={ordered.length === 0 ? "outline" : "default"}
            disabled={ordered.length === 0}
          >
            <a href={presentHref} target="_blank" rel="noopener noreferrer">
              <Presentation className="h-4 w-4" /> Present
            </a>
          </Button>
        </div>
      </div>

      {ordered.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">
            No materials yet. Add a deck, file, doc, or link to present in this
            meeting.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {ordered.map((m, i) => (
            <li
              key={m.projectLinkId}
              className="flex items-center gap-3 px-4 py-2.5"
            >
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-[var(--muted)] text-[var(--muted-foreground)]">
                {kindIcon(m.kind)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{m.label}</div>
                <div className="truncate text-xs text-[var(--muted-foreground)]">
                  <span className="uppercase tracking-wide">
                    {materialType(m.kind, m.mimeType, m.originalFilename ?? m.label).label}
                  </span>
                  {m.lobTitle ? ` · ${m.lobTitle}` : ""}
                </div>
              </div>
              <div className="flex flex-none items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0 || pending}
                  className="flex h-7 w-7 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-30"
                  aria-label="Move up"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === ordered.length - 1 || pending}
                  className="flex h-7 w-7 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => detach(m.projectLinkId)}
                  disabled={pending}
                  className="flex h-7 w-7 items-center justify-center rounded text-[var(--muted-foreground)] hover:bg-[var(--destructive)]/10 hover:text-[var(--destructive)] disabled:opacity-30"
                  aria-label="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <MaterialPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        attachable={attachable}
        attachedIds={attachedIds}
        onAttach={attach}
      />

      <ShareMaterialsDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        meetingId={meetingId}
        attendees={attendees}
        materialCount={ordered.length}
      />
    </div>
  );
}

function ShareMaterialsDialog({
  open,
  onOpenChange,
  meetingId,
  attendees,
  materialCount,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  meetingId: string;
  attendees: MeetingAttendee[];
  materialCount: number;
}) {
  const [contactId, setContactId] = useState<string | null>(
    attendees[0]?.id ?? null,
  );
  const [allowDownload, setAllowDownload] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setLink(null);
    setCopied(false);
    setMessage("");
  }

  function create() {
    if (!contactId) return;
    startTransition(async () => {
      const res = await shareMeetingMaterialsAction(meetingId, contactId, {
        allowDownload,
        message: message.trim() || null,
      });
      if (res.ok) {
        const url = `${window.location.origin}${res.url}`;
        setLink(url);
        toast.success(`Shared ${res.count} material${res.count === 1 ? "" : "s"}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy");
    }
  }

  const selected = attendees.find((a) => a.id === contactId) ?? null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md gap-4">
        <DialogHeader>
          <DialogTitle>Share with a client</DialogTitle>
          <DialogDescription>
            Send {materialCount} material{materialCount === 1 ? "" : "s"} as a
            private, tracked link they can open on any device.
          </DialogDescription>
        </DialogHeader>

        {link ? (
          <div className="space-y-3">
            <div className="rounded-md border border-[var(--border)] bg-[var(--muted)] p-2.5">
              <div className="mb-1 text-xs font-medium text-[var(--muted-foreground)]">
                Private link{selected ? ` for ${selected.name}` : ""}
              </div>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate text-xs">{link}</code>
                <Button size="sm" variant="outline" onClick={copy}>
                  {copied ? (
                    <Check className="h-4 w-4 text-[var(--risk-green,#1A5C2A)]" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={reset}>
                Share with someone else
              </Button>
              <Button asChild size="sm">
                <a href={link} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" /> Preview
                </a>
              </Button>
            </div>
          </div>
        ) : attendees.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--muted-foreground)]">
            Add an attendee to this meeting first — the client link is issued to
            a specific person.
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 text-xs font-medium text-[var(--muted-foreground)]">
                Recipient
              </div>
              <div className="space-y-1.5">
                {attendees.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setContactId(a.id)}
                    className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition ${
                      contactId === a.id
                        ? "border-[var(--primary)] bg-[var(--primary)]/5"
                        : "border-[var(--border)] hover:bg-[var(--muted)]"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 flex-none items-center justify-center rounded-full border ${
                        contactId === a.id
                          ? "border-[var(--primary)]"
                          : "border-[var(--border)]"
                      }`}
                    >
                      {contactId === a.id && (
                        <span className="h-2 w-2 rounded-full bg-[var(--primary)]" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {a.name}
                      </span>
                      {a.organization && (
                        <span className="block truncate text-xs text-[var(--muted-foreground)]">
                          {a.organization}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <Textarea
              rows={2}
              placeholder="Optional note shown to the client…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowDownload}
                onChange={(e) => setAllowDownload(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)]"
              />
              Allow the client to download files
            </label>

            <Button
              className="w-full"
              onClick={create}
              disabled={!contactId || pending}
            >
              {pending ? "Creating link…" : "Create client link"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MaterialPicker({
  open,
  onOpenChange,
  attachable,
  attachedIds,
  onAttach,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  attachable: AttachableMaterial[];
  attachedIds: Set<string>;
  onAttach: (material: AttachableMaterial) => void;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<MaterialTypeKey | "all">("all");

  // Tag each material with its type once, so filtering + display agree.
  const typed = useMemo(
    () =>
      attachable.map((m) => ({
        ...m,
        type: materialType(m.kind, m.mimeType, m.originalFilename ?? m.label),
      })),
    [attachable],
  );

  // Which type chips to show — only types actually present, in canonical order,
  // each with a count.
  const typesPresent = useMemo(() => {
    const counts = new Map<MaterialTypeKey, number>();
    for (const m of typed) counts.set(m.type.key, (counts.get(m.type.key) ?? 0) + 1);
    return MATERIAL_TYPE_ORDER.filter((k) => counts.has(k)).map((k) => ({
      key: k,
      count: counts.get(k)!,
    }));
  }, [typed]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = typed.filter(
      (m) =>
        (typeFilter === "all" || m.type.key === typeFilter) &&
        (!q ||
          m.label.toLowerCase().includes(q) ||
          (m.lobTitle ?? "").toLowerCase().includes(q)),
    );
    const map = new Map<string, typeof filtered>();
    for (const m of filtered) {
      const key = m.lobTitle ?? "Other";
      const arr = map.get(key) ?? [];
      arr.push(m);
      map.set(key, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [typed, query, typeFilter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-xl gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Add material</DialogTitle>
          <DialogDescription>
            Attach a deck, file, doc, or link from any line of business.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Search materials…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {typesPresent.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <FilterChip
              active={typeFilter === "all"}
              onClick={() => setTypeFilter("all")}
            >
              All
            </FilterChip>
            {typesPresent.map((t) => (
              <FilterChip
                key={t.key}
                active={typeFilter === t.key}
                onClick={() => setTypeFilter(t.key)}
              >
                {materialTypeLabel(t.key)}
                <span className="ml-1 opacity-60">{t.count}</span>
              </FilterChip>
            ))}
          </div>
        )}

        <div className="-mx-2 max-h-[48vh] overflow-y-auto px-2">
          {groups.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
              No materials match.
            </p>
          ) : (
            groups.map(([lob, items]) => (
              <div key={lob} className="mb-4">
                <div className="sticky top-0 bg-[var(--background)] py-1 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  {lob}
                </div>
                <ul className="space-y-1">
                  {items.map((m) => {
                    const isAttached =
                      m.attached || attachedIds.has(m.projectLinkId);
                    return (
                    <li key={m.projectLinkId}>
                      <button
                        type="button"
                        disabled={isAttached}
                        onClick={() => onAttach(m)}
                        className="flex w-full items-center gap-3 rounded-md border border-transparent px-2 py-2 text-left hover:border-[var(--border)] hover:bg-[var(--muted)] disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
                      >
                        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-[var(--muted)] text-[var(--muted-foreground)]">
                          {kindIcon(m.kind)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {m.label}
                          </span>
                          <span className="block truncate text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                            {m.type.label}
                          </span>
                        </span>
                        {isAttached ? (
                          <Badge variant="outline">Added</Badge>
                        ) : (
                          <Plus className="h-4 w-4 flex-none text-[var(--muted-foreground)]" />
                        )}
                      </button>
                    </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
        active
          ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
          : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
      }`}
    >
      {children}
    </button>
  );
}
