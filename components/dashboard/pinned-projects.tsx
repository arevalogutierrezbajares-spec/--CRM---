"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Clock3,
  ExternalLink,
  FileText,
  FolderOpen,
  Gauge,
  Link as LinkIcon,
  ListChecks,
  ListTodo,
  Pin,
  PinOff,
  Plus,
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

const HEALTH: Record<PinnedProject["health"], string> = {
  green: "var(--green-mid)",
  amber: "var(--amber-text)",
  red: "var(--red-text)",
};

function formatTouched(iso: string | null): string {
  if (!iso) return "No updates";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function shortStatus(status: string): string {
  return status.replace(/_/g, " ");
}

function docIcon(doc: PinnedDoc) {
  return doc.kind === "link" ? LinkIcon : FileText;
}

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

  const pinnedIds = useMemo(() => new Set(pinned.map((p) => p.id)), [pinned]);
  const pinnable = allProjects.filter((p) => !pinnedIds.has(p.id));
  const selected = pinned.find((p) => p.id === open) ?? pinned[0] ?? null;
  const recentUnpinned = recent.filter((r) => !pinnedIds.has(r.id));

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

  function toggle(projectId: string) {
    startTransition(async () => {
      const res = await togglePinAction({ projectId });
      if (res.ok) router.refresh();
      else toast.error(res.error);
    });
  }

  function renderDocLink(projectId: string, doc: PinnedDoc, mode: "chip" | "action" = "chip") {
    const Icon = docIcon(doc);
    const base =
      "group inline-flex min-h-[40px] min-w-0 items-center gap-1.5 rounded-md border px-2 text-[12px] text-text-primary transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";
    const style = { borderColor: "var(--border-default)" };
    const body = (
      <>
        <Icon size={13} className="shrink-0 text-text-tertiary group-hover:text-[var(--blue-text)]" />
        <span className={mode === "chip" ? "max-w-[160px] truncate" : "shrink-0"}>{mode === "chip" ? doc.label : "Open"}</span>
        {doc.kind === "link" && <ExternalLink size={11} className="shrink-0 text-text-tertiary" />}
      </>
    );

    if (doc.kind === "link" && doc.url) {
      return (
        <a key={doc.id} href={doc.url} target="_blank" rel="noopener noreferrer" className={base} style={style}>
          {body}
        </a>
      );
    }
    if (doc.kind === "file") {
      return (
        <button key={doc.id} type="button" onClick={() => preview(doc)} className={base} style={style}>
          {body}
        </button>
      );
    }
    return (
      <Link key={doc.id} href={`/lob/${projectId}/docs/${doc.id}`} className={base} style={style}>
        {body}
      </Link>
    );
  }

  return (
    <DashCard className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] p-3">
        <div>
          <SectionLabel icon={Pin}>Pinned projects</SectionLabel>
          <p className="mt-1 text-[12px] text-text-tertiary">
            Docs, latest updates and open work in one place.
          </p>
        </div>
        {pinnable.length > 0 && (
          <Select onValueChange={(v) => toggle(v)}>
            <SelectTrigger className="h-[40px] w-full text-tiny sm:w-[176px]">
              <span className="flex min-w-0 items-center gap-1 text-text-tertiary">
                <Plus size={12} /> <span className="truncate">Pin a project</span>
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
        <p className="px-3 py-5 text-center text-[12px] text-text-secondary">
          Pin a project to keep documents, tasks and action items one click away.
        </p>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(300px,1.05fr)]">
          <div className="space-y-2 border-b border-[var(--border)] p-2 lg:border-b-0 lg:border-r">
            {pinned.map((p) => {
              const isSelected = selected?.id === p.id;
              const health = HEALTH[p.health];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setOpen(p.id)}
                  className="min-h-[96px] w-full rounded-lg border p-2.5 text-left outline-none transition-[border-color,background,transform] hover:bg-surface focus-visible:ring-2 focus-visible:ring-[var(--ring)] active:scale-[0.99]"
                  style={{
                    borderColor: isSelected ? health : "var(--border-default)",
                    background: isSelected ? "color-mix(in oklab, var(--bg-surface) 68%, transparent)" : undefined,
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: health }} />
                        <span className="truncate text-[12.5px] font-semibold text-text-primary">{p.title}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-tiny text-text-tertiary">
                        <span>{shortStatus(p.status)}</span>
                        <span>{p.docs.length} docs</span>
                        <span>{p.openTasks} open</span>
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-card px-1.5 py-0.5 text-tiny text-text-tertiary">
                      <Clock3 size={10} /> {formatTouched(p.lastUpdatedAt)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-card">
                      <span
                        className="block h-full rounded-full transition-[width] duration-300"
                        style={{ width: `${p.progressPct}%`, background: health }}
                      />
                    </div>
                    <span className="w-9 text-right text-tiny tabular-nums text-text-tertiary">{p.progressPct}%</span>
                  </div>
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="min-w-0 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: HEALTH[selected.health] }} />
                    <h3 className="truncate text-[15px] font-semibold text-text-primary">{selected.title}</h3>
                  </div>
                  <p className="mt-1 text-[12px] text-text-secondary">
                    Latest touched {formatTouched(selected.lastUpdatedAt)}.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <Link
                    href={`/lob/${selected.id}`}
                    className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-md bg-surface px-3 text-[12px] font-medium text-text-primary transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    Open <ArrowUpRight size={13} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggle(selected.id)}
                    disabled={pending}
                    className="grid h-[40px] w-[40px] place-items-center rounded-md text-text-tertiary transition-colors hover:bg-surface hover:text-[var(--destructive)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
                    aria-label={`Unpin ${selected.title}`}
                    title="Unpin"
                  >
                    <PinOff size={14} />
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-md bg-surface px-2 py-2">
                  <div className="flex items-center gap-1 text-tiny text-text-tertiary"><FolderOpen size={11} /> Docs</div>
                  <div className="mt-1 text-[16px] font-semibold tabular-nums text-text-primary">{selected.docs.length}</div>
                </div>
                <div className="rounded-md bg-surface px-2 py-2">
                  <div className="flex items-center gap-1 text-tiny text-text-tertiary"><ListChecks size={11} /> Tasks</div>
                  <div className="mt-1 text-[16px] font-semibold tabular-nums text-text-primary">{selected.openTasks}</div>
                </div>
                <div className="rounded-md bg-surface px-2 py-2">
                  <div className="flex items-center gap-1 text-tiny text-text-tertiary"><Gauge size={11} /> Done</div>
                  <div className="mt-1 text-[16px] font-semibold tabular-nums text-text-primary">{selected.progressPct}%</div>
                </div>
              </div>

              <div className="mt-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 text-tiny font-medium text-text-tertiary">
                    <Clock3 size={11} /> Latest documents touched
                  </div>
                  <Link href={`/lob/${selected.id}`} className="text-tiny text-[var(--blue-text)] hover:underline">
                    All docs
                  </Link>
                </div>
                {selected.latestDocs.length === 0 ? (
                  <Link href={`/lob/${selected.id}`} className="block min-h-[40px] rounded-md bg-surface px-2 py-2 text-[12px] text-text-tertiary hover:text-text-primary">
                    No documents yet. Add the first one.
                  </Link>
                ) : (
                  <ul className="space-y-1">
                    {selected.latestDocs.map((doc) => (
                      <li key={doc.id} className="flex min-h-[40px] items-center justify-between gap-2 rounded-md bg-surface px-2 py-1.5">
                        <div className="min-w-0">
                          <div className="truncate text-[12px] text-text-primary">{doc.label}</div>
                          <div className="text-tiny text-text-tertiary">{doc.category} · {formatTouched(doc.updatedAt)}</div>
                        </div>
                        {renderDocLink(selected.id, doc, "action")}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {selected.docs.length > selected.latestDocs.length && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {selected.docs
                    .filter((doc) => !selected.latestDocs.some((latest) => latest.id === doc.id))
                    .slice(0, 4)
                    .map((doc) => renderDocLink(selected.id, doc, "chip"))}
                </div>
              )}

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-1 text-tiny font-medium text-text-tertiary">
                    <ListChecks size={11} /> Open tasks
                  </div>
                  {selected.tasks.length === 0 ? (
                    <p className="rounded-md bg-surface px-2 py-2 text-[12px] text-text-tertiary">No open tasks.</p>
                  ) : (
                    <ul className="space-y-1">
                      {selected.tasks.slice(0, 4).map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => drawer?.openItem("milestone", t.id)}
                            className="min-h-[40px] w-full truncate rounded-md bg-surface px-2 py-1.5 text-left text-[12px] text-text-primary outline-none transition-colors hover:text-[var(--blue-text)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                          >
                            {t.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-1 text-tiny font-medium text-text-tertiary">
                    <ListTodo size={11} /> Action items
                  </div>
                  {selected.actionItems.length === 0 ? (
                    <p className="rounded-md bg-surface px-2 py-2 text-[12px] text-text-tertiary">No open action items.</p>
                  ) : (
                    <ul className="space-y-1">
                      {selected.actionItems.slice(0, 4).map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => drawer?.openItem("action_item", a.id)}
                            className="min-h-[40px] w-full truncate rounded-md bg-surface px-2 py-1.5 text-left text-[12px] text-text-primary outline-none transition-colors hover:text-[var(--blue-text)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                          >
                            {a.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {recentUnpinned.length > 0 && (
        <div className="border-t border-[var(--border)] p-3">
          <div className="mb-1.5 text-tiny text-text-tertiary">Recently opened</div>
          <div className="flex flex-wrap gap-1.5">
            {recentUnpinned.slice(0, 6).map((r) => (
              <div key={r.id} className="group flex min-h-[40px] items-center rounded-full bg-surface pr-0.5">
                <Link href={`/lob/${r.id}`} className="max-w-[150px] truncate rounded-full px-2.5 py-1.5 text-tiny text-text-secondary hover:text-text-primary">
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
