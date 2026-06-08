"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Pin,
  PinOff,
  Plus,
  ChevronRight,
  FileText,
  Link as LinkIcon,
  ListTodo,
  ListChecks,
} from "lucide-react";
import { DashCard } from "./shared/dash-card";
import { SectionLabel } from "./shared/section-label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { togglePinAction } from "@/app/(app)/dashboard/pin-actions";
import { useItemDrawer } from "./item-drawer";
import { FilePreviewModal, type PreviewFile } from "../lob/file-preview-modal";
import { getFileSignedUrlAction } from "@/app/(app)/lob/actions";
import type { PinnedProject, PinnedDoc } from "@/db/queries/pins";

const HEALTH: Record<string, string> = {
  green: "var(--green-mid)",
  amber: "var(--amber-text)",
  red: "var(--red-text)",
};

export function PinnedProjects({
  pinned,
  allProjects,
  recent = [],
}: {
  pinned: PinnedProject[];
  allProjects: { id: string; title: string }[];
  recent?: { id: string; title: string }[];
}) {
  const router = useRouter();
  const drawer = useItemDrawer();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<string | null>(pinned[0]?.id ?? null);
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  function preview(d: PinnedDoc) {
    setPreviewFile({ linkId: d.id, label: d.label, filename: d.filename ?? d.label, mime: d.mime ?? "" });
    setPreviewUrl(null);
    setPreviewError(null);
    setPreviewLoading(true);
    setPreviewOpen(true);
    startTransition(async () => {
      const res = await getFileSignedUrlAction({ linkId: d.id });
      if (res.ok) setPreviewUrl(res.url);
      else setPreviewError(res.error);
      setPreviewLoading(false);
    });
  }

  const pinnedIds = useMemo(() => new Set(pinned.map((p) => p.id)), [pinned]);
  const pinnable = allProjects.filter((p) => !pinnedIds.has(p.id));

  function toggle(projectId: string) {
    startTransition(async () => {
      const res = await togglePinAction({ projectId });
      if (res.ok) router.refresh();
      else toast.error(res.error);
    });
  }

  return (
    <DashCard>
      <div className="mb-1 flex items-center justify-between">
        <SectionLabel icon={Pin}>Pinned projects</SectionLabel>
        {pinnable.length > 0 && (
          <Select onValueChange={(v) => toggle(v)}>
            <SelectTrigger className="h-[40px] w-[164px] text-tiny">
              <span className="flex items-center gap-1 text-text-tertiary">
                <Plus size={12} /> Pin a project
              </span>
            </SelectTrigger>
            <SelectContent>
              {pinnable.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {pinned.length === 0 ? (
        <p className="py-4 text-center text-[12px] text-text-secondary">
          Pin a project to keep its docs, tasks &amp; action items one click away.
        </p>
      ) : (
        <div className="space-y-1.5">
          {pinned.map((p) => {
            const isOpen = open === p.id;
            return (
              <div key={p.id} className="rounded-md border border-[var(--border)]">
                <div className="flex min-h-12 items-center gap-1.5 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : p.id)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 self-stretch rounded-sm text-left outline-none transition-transform active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    <ChevronRight
                      size={13}
                      className={`shrink-0 text-text-tertiary transition-transform ${isOpen ? "rotate-90" : ""}`}
                    />
                    <span
                      role="img"
                      aria-label={`Health: ${p.health}`}
                      className="h-2 w-2 shrink-0 rounded-full"
                      title={`Health: ${p.health}`}
                      style={{ background: HEALTH[p.health] }}
                    />
                    <span className="truncate text-[12.5px] font-medium text-text-primary">{p.title}</span>
                    {/* progress */}
                    {p.totalTasks > 0 && (
                      <span className="hidden sm:flex shrink-0 items-center gap-1" title={`${p.progressPct}% of ${p.totalTasks} tasks done`}>
                        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-surface">
                          <span className="block h-full rounded-full" style={{ width: `${p.progressPct}%`, background: "var(--green-mid)" }} />
                        </span>
                        <span className="text-tiny text-text-tertiary tabular-nums">{p.progressPct}%</span>
                      </span>
                    )}
                    {p.nextMilestone && (
                      <span className="hidden shrink-0 truncate text-tiny text-text-tertiary md:inline" title="Next milestone">
                        · next: {p.nextMilestone.title}
                      </span>
                    )}
                    <span
                      className="shrink-0 text-tiny text-text-tertiary tabular-nums"
                      title={`${p.docs.length} docs · ${p.openTasks} open tasks · ${p.actionItems.length} action items`}
                    >
                      {p.docs.length}d · {p.openTasks}t · {p.actionItems.length}a
                    </span>
                  </button>
                  <Link
                    href={`/lob/${p.id}`}
                    className="grid min-h-[40px] shrink-0 place-items-center rounded-md px-2 text-tiny text-[var(--blue-text)] transition-colors hover:bg-surface hover:underline"
                  >
                    open
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    disabled={pending}
                    aria-label={`Unpin ${p.title}`}
                    className="grid h-[40px] w-[40px] shrink-0 place-items-center rounded-md text-text-tertiary transition-colors hover:bg-surface hover:text-[var(--destructive)]"
                  >
                    <PinOff size={12} />
                  </button>
                </div>

                {isOpen && (
                  <div className="space-y-2 border-t border-[var(--border)] px-3 py-2.5">
                    {/* Docs / folders */}
                    <div>
                      <div className="mb-1 flex items-center gap-1 text-tiny text-text-tertiary">
                        <FileText size={11} /> Docs &amp; links
                      </div>
                      {p.docs.length === 0 ? (
                        <Link href={`/lob/${p.id}`} className="text-tiny text-text-tertiary hover:underline">
                          No docs yet — add some →
                        </Link>
                      ) : (
                        <ul className="space-y-1">
                          {p.docs.map((d) => (
                            <li key={d.id} className="flex min-h-[40px] items-center gap-1.5 rounded px-1 text-[12px] transition-colors hover:bg-surface">
                              {d.kind === "link" ? <LinkIcon size={11} className="text-text-tertiary" /> : <FileText size={11} className="text-text-tertiary" />}
                              {d.kind === "link" && d.url ? (
                                <a href={d.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate rounded-sm text-[var(--blue-text)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]">{d.label}</a>
                              ) : d.kind === "file" ? (
                                <button type="button" onClick={() => preview(d)} className="min-w-0 flex-1 truncate rounded-sm text-left text-text-primary outline-none hover:text-[var(--blue-text)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                                  {d.label}
                                </button>
                              ) : (
                                <Link href={`/lob/${p.id}/docs/${d.id}`} className="min-w-0 flex-1 truncate rounded-sm text-text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]">{d.label}</Link>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Tasks — click opens the item drawer */}
                    {p.tasks.length > 0 && (
                      <div>
                        <div className="mb-1 flex items-center gap-1 text-tiny text-text-tertiary">
                          <ListChecks size={11} /> Open tasks
                        </div>
                        <ul className="space-y-1">
                          {p.tasks.map((t) => (
                            <li key={t.id}>
                              <button
                                type="button"
                                onClick={() => drawer?.openItem("milestone", t.id)}
                                className="min-h-[40px] w-full truncate rounded px-1 text-left text-[12px] text-text-primary outline-none transition-colors hover:bg-surface hover:text-[var(--blue-text)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                              >
                                {t.title}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Action items — click opens the item drawer */}
                    {p.actionItems.length > 0 && (
                      <div>
                        <div className="mb-1 flex items-center gap-1 text-tiny text-text-tertiary">
                          <ListTodo size={11} /> Action items
                        </div>
                        <ul className="space-y-1">
                          {p.actionItems.map((a) => (
                            <li key={a.id}>
                              <button
                                type="button"
                                onClick={() => drawer?.openItem("action_item", a.id)}
                                className="min-h-[40px] w-full truncate rounded px-1 text-left text-[12px] text-text-primary outline-none transition-colors hover:bg-surface hover:text-[var(--blue-text)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                              >
                                {a.title}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {recent.filter((r) => !pinnedIds.has(r.id)).length > 0 && (
        <div className="mt-2.5 border-t border-[var(--border)] pt-2">
          <div className="mb-1 text-tiny text-text-tertiary">Recently opened</div>
          <div className="flex flex-wrap gap-1.5">
            {recent
              .filter((r) => !pinnedIds.has(r.id))
              .slice(0, 6)
              .map((r) => (
                <div key={r.id} className="group flex min-h-[40px] items-center rounded-full bg-surface pr-0.5">
                  <Link href={`/lob/${r.id}`} className="max-w-[140px] truncate rounded-full px-2.5 py-1.5 text-tiny text-text-secondary hover:text-text-primary">
                    {r.title}
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggle(r.id)}
                    aria-label={`Pin ${r.title}`}
                    title="Pin"
                    className="grid h-[40px] w-[40px] place-items-center rounded-full text-text-tertiary opacity-0 transition-opacity hover:text-[var(--blue-text)] focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <Pin size={11} />
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      <FilePreviewModal
        file={previewFile}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        url={previewUrl}
        error={previewError}
        loading={previewLoading}
      />
    </DashCard>
  );
}
