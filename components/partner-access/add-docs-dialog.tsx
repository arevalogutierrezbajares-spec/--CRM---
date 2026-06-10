"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  addRoomDocumentsAction,
  listShareableRoomDocsAction,
} from "@/app/(app)/partner-access/actions";
import type { ShareableRoomDoc } from "@/db/queries/partner-access";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatBytes } from "@/lib/project-files/limits";

/**
 * Add workspace documents to a room without leaving the room page. Reuses the
 * share pipeline under the hood, pinned to this room.
 */
export function AddDocsDialog({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<ShareableRoomDoc[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allowDownload, setAllowDownload] = useState(true);
  const [pending, startTransition] = useTransition();

  async function openDialog() {
    setOpen(true);
    setSelected(new Set());
    setQuery("");
    // Always refetch on open so "already in room" flags reflect shares made
    // elsewhere; keep any cached list visible as an instant placeholder.
    setLoading(docs === null);
    const res = await listShareableRoomDocsAction({ roomId }).catch(() => null);
    setLoading(false);
    if (res?.ok) setDocs(res.docs);
    else if (docs === null) {
      toast.error(res && !res.ok ? res.error : "Could not load documents");
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function add() {
    const items = (docs ?? [])
      .filter((doc) => selected.has(doc.id))
      .map((doc) => ({ linkId: doc.id, lobId: doc.lobId }));
    if (items.length === 0) return;

    startTransition(async () => {
      const res = await addRoomDocumentsAction({ roomId, items, allowDownload });
      if (res.ok) {
        const base =
          res.added === 1 ? "Document added" : `${res.added} documents added`;
        if (res.failed > 0) {
          toast.warning(`${base}, ${res.failed} couldn't be added`);
        } else {
          toast.success(base);
        }
        setOpen(false);
        setDocs(null); // re-fetch next time so shared flags stay honest
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const q = query.trim().toLowerCase();
  const visible = (docs ?? []).filter(
    (doc) =>
      !q ||
      doc.label.toLowerCase().includes(q) ||
      doc.lobTitle.toLowerCase().includes(q),
  );

  const grouped = new Map<string, ShareableRoomDoc[]>();
  for (const doc of visible) {
    const list = grouped.get(doc.lobTitle) ?? [];
    list.push(doc);
    grouped.set(doc.lobTitle, list);
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={openDialog}>
        <FilePlus2 className="h-4 w-4" />
        Add documents
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add documents to this room</DialogTitle>
            <DialogDescription>
              Pick files, docs, or links from any project. They appear in the
              client&rsquo;s room immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--muted-foreground)]" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or project…"
              className="pl-8"
              aria-label="Search documents"
            />
          </div>

          <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
            {loading ? (
              <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
                Loading documents…
              </p>
            ) : visible.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
                {q ? "Nothing matches that search." : "No shareable documents yet."}
              </p>
            ) : (
              Array.from(grouped.entries()).map(([lobTitle, items]) => (
                <div key={lobTitle}>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                    {lobTitle}
                  </p>
                  <ul className="space-y-1">
                    {items.map((doc) => (
                      <li key={doc.id}>
                        <label
                          className={`flex cursor-pointer items-center gap-2.5 rounded-md border border-[var(--border)] px-2.5 py-2 ${
                            doc.alreadyShared ? "opacity-60" : "hover:bg-[var(--secondary)]"
                          }`}
                        >
                          <Checkbox
                            checked={selected.has(doc.id)}
                            disabled={doc.alreadyShared}
                            onCheckedChange={() => toggle(doc.id)}
                            aria-label={`Select ${doc.label}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{doc.label}</span>
                            <span className="block text-xs text-[var(--muted-foreground)]">
                              {doc.kind}
                              {doc.sizeBytes ? ` · ${formatBytes(doc.sizeBytes)}` : ""}
                              {doc.alreadyShared ? " · already in room" : ""}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={allowDownload}
              onCheckedChange={(checked) => setAllowDownload(checked === true)}
              aria-label="Allow download"
            />
            Allow download
          </label>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={add}
              disabled={pending || selected.size === 0}
            >
              {pending
                ? "Adding…"
                : selected.size > 0
                  ? `Add ${selected.size} ${selected.size === 1 ? "document" : "documents"}`
                  : "Add documents"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
