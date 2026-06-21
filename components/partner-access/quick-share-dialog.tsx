"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  DoorOpen,
  FileText,
  LinkIcon,
  Search,
  Send,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  listShareableDocsForContactAction,
  quickShareWithContactAction,
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes } from "@/lib/project-files/limits";

const CHANNELS = [
  { value: "link", label: "Copy link" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "signal", label: "Signal" },
  { value: "manual", label: "Manual" },
];

type Step = "pick" | "done";

/**
 * One-tap "Share materials" from a contact. Pick documents, generate a private
 * no-login link the recipient taps and views on their phone — every open and
 * view is tracked automatically. Replaces the old create-room-then-add-docs
 * two-step and the forced pitch-feedback walkthrough.
 */
export function QuickShareDialog({
  contactId,
  contactName,
  partnerKind,
  triggerVariant = "default",
  triggerLabel = "Share materials",
}: {
  contactId: string;
  contactName: string;
  partnerKind?: string | null;
  triggerVariant?: "default" | "outline" | "ghost";
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("pick");
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<ShareableRoomDoc[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({}); // linkId -> lobId
  const [query, setQuery] = useState("");
  const [allowDownload, setAllowDownload] = useState(false);
  const [channel, setChannel] = useState("link");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const [result, setResult] = useState<{
    roomId: string;
    accessUrl: string | null;
    added: number;
    existed: boolean;
  } | null>(null);

  const selectedCount = Object.keys(selected).length;

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = docs.filter(
      (d) =>
        !q ||
        d.label.toLowerCase().includes(q) ||
        d.lobTitle.toLowerCase().includes(q),
    );
    const byLob = new Map<string, ShareableRoomDoc[]>();
    for (const d of matches) {
      const list = byLob.get(d.lobTitle) ?? [];
      list.push(d);
      byLob.set(d.lobTitle, list);
    }
    return Array.from(byLob.entries());
  }, [docs, query]);

  async function load() {
    setLoading(true);
    const res = await listShareableDocsForContactAction({ contactId });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setDocs(res.docs);
  }

  function openDialog() {
    setOpen(true);
    setStep("pick");
    setResult(null);
    setSelected({});
    setQuery("");
    setMessage("");
    setAllowDownload(false);
    setChannel("link");
    void load();
  }

  function toggle(doc: ShareableRoomDoc) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[doc.id]) delete next[doc.id];
      else next[doc.id] = doc.lobId;
      return next;
    });
  }

  function share(freshLink: boolean) {
    if (selectedCount === 0) {
      toast.error("Pick at least one document");
      return;
    }
    startTransition(async () => {
      const res = await quickShareWithContactAction({
        contactId,
        partnerKind: partnerKind ?? null,
        docs: Object.entries(selected).map(([linkId, lobId]) => ({ linkId, lobId })),
        allowDownload,
        channel,
        message: message.trim() || null,
        freshLink,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const accessUrl =
        res.accessPath && typeof window !== "undefined"
          ? `${window.location.origin}${res.accessPath}`
          : null;
      setResult({
        roomId: res.roomId,
        accessUrl,
        added: res.added,
        existed: res.existed,
      });
      setStep("done");
      router.refresh();
    });
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    toast.success("Private link copied");
  }

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size="sm"
        className="w-full"
        onClick={openDialog}
      >
        <Sparkles className="h-4 w-4" />
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-lg">
          {step === "done" && result ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                    <Check className="h-4 w-4" />
                  </span>
                  {result.added} {result.added === 1 ? "document" : "documents"} shared
                </DialogTitle>
                <DialogDescription>
                  {result.accessUrl
                    ? `Send this private link to ${contactName}. No login — they tap it and view on any phone. Every open is tracked automatically.`
                    : `Added to ${contactName}'s existing room. Issue a fresh private link below, or open the room to manage it.`}
                </DialogDescription>
              </DialogHeader>

              {result.accessUrl ? (
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <Input
                      value={result.accessUrl}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => copy(result.accessUrl as string)}
                    >
                      <Copy className="h-4 w-4" />
                      Copy
                    </Button>
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Copy it now — the full link isn&rsquo;t shown again.
                  </p>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => share(true)}
                  disabled={pending}
                >
                  <Send className="h-4 w-4" />
                  {pending ? "Issuing…" : "Generate fresh link"}
                </Button>
              )}

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                >
                  Done
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    router.push(`/partner-access/rooms/${result.roomId}`);
                  }}
                >
                  <DoorOpen className="h-4 w-4" />
                  Open room
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Share materials with {contactName}</DialogTitle>
                <DialogDescription>
                  Pick documents to send. They get a private link — no login,
                  view on any phone — and every open is tracked back here.
                </DialogDescription>
              </DialogHeader>

              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search documents…"
                  className="pl-8"
                />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--border)]">
                {loading ? (
                  <p className="p-4 text-sm text-[var(--muted-foreground)]">
                    Loading documents…
                  </p>
                ) : docs.length === 0 ? (
                  <p className="p-4 text-sm text-[var(--muted-foreground)]">
                    No documents in your workspace yet. Add files to a project
                    first, then share them here.
                  </p>
                ) : grouped.length === 0 ? (
                  <p className="p-4 text-sm text-[var(--muted-foreground)]">
                    Nothing matches “{query}”.
                  </p>
                ) : (
                  grouped.map(([lobTitle, items]) => (
                    <div key={lobTitle}>
                      <div className="sticky top-0 bg-[var(--secondary)]/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] backdrop-blur">
                        {lobTitle}
                      </div>
                      <ul>
                        {items.map((doc) => {
                          const checked = Boolean(selected[doc.id]);
                          return (
                            <li key={doc.id}>
                              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-[var(--secondary)]/40">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => toggle(doc)}
                                />
                                {doc.kind === "link" ? (
                                  <LinkIcon className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
                                ) : (
                                  <FileText className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
                                )}
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate">{doc.label}</span>
                                  {doc.sizeBytes ? (
                                    <span className="text-xs text-[var(--muted-foreground)]">
                                      {formatBytes(doc.sizeBytes)}
                                    </span>
                                  ) : null}
                                </span>
                                {doc.alreadyShared && (
                                  <span className="shrink-0 rounded bg-[var(--secondary)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                                    shared
                                  </span>
                                )}
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={allowDownload}
                    onCheckedChange={(v) => setAllowDownload(Boolean(v))}
                  />
                  Allow downloads (off = view-only)
                </label>

                <div className="space-y-1.5">
                  <Label htmlFor="quick-share-channel">Sending via</Label>
                  <Select value={channel} onValueChange={setChannel}>
                    <SelectTrigger id="quick-share-channel">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="quick-share-message">Note (optional)</Label>
                  <Textarea
                    id="quick-share-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={2}
                    placeholder="A short line you'll send alongside the link."
                  />
                </div>
              </div>

              <DialogFooter className="gap-2">
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
                  onClick={() => share(false)}
                  disabled={pending || selectedCount === 0}
                >
                  <Send className="h-4 w-4" />
                  {pending
                    ? "Sharing…"
                    : selectedCount > 0
                      ? `Share ${selectedCount}`
                      : "Share"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
