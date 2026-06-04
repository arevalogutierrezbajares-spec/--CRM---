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
import type { PinnedProject } from "@/db/queries/pins";

export function PinnedProjects({
  pinned,
  allProjects,
}: {
  pinned: PinnedProject[];
  allProjects: { id: string; title: string }[];
}) {
  const router = useRouter();
  const drawer = useItemDrawer();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<string | null>(pinned[0]?.id ?? null);

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
            <SelectTrigger className="h-7 w-[150px] text-tiny">
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
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : p.id)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <ChevronRight
                      size={13}
                      className={`shrink-0 text-text-tertiary transition-transform ${isOpen ? "rotate-90" : ""}`}
                    />
                    <span className="truncate text-[12.5px] font-medium text-text-primary">{p.title}</span>
                    <span className="shrink-0 text-tiny text-text-tertiary tabular-nums">
                      {p.docs.length}d · {p.tasks.length}t · {p.actionItems.length}a
                    </span>
                  </button>
                  <Link
                    href={`/projects/${p.id}`}
                    className="shrink-0 rounded px-1 text-tiny text-[var(--blue-text)] hover:underline"
                  >
                    open
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    disabled={pending}
                    aria-label={`Unpin ${p.title}`}
                    className="shrink-0 rounded p-0.5 text-text-tertiary hover:text-[var(--destructive)]"
                  >
                    <PinOff size={12} />
                  </button>
                </div>

                {isOpen && (
                  <div className="space-y-2 border-t border-[var(--border)] px-3 py-2">
                    {/* Docs / folders */}
                    <div>
                      <div className="mb-1 flex items-center gap-1 text-tiny text-text-tertiary">
                        <FileText size={11} /> Docs &amp; links
                      </div>
                      {p.docs.length === 0 ? (
                        <Link href={`/projects/${p.id}`} className="text-tiny text-text-tertiary hover:underline">
                          No docs yet — add some →
                        </Link>
                      ) : (
                        <ul className="space-y-0.5">
                          {p.docs.map((d) => (
                            <li key={d.id} className="flex items-center gap-1.5 text-[12px]">
                              {d.kind === "link" ? <LinkIcon size={11} className="text-text-tertiary" /> : <FileText size={11} className="text-text-tertiary" />}
                              {d.url ? (
                                <a href={d.url} target="_blank" rel="noopener noreferrer" className="truncate text-[var(--blue-text)] hover:underline">{d.label}</a>
                              ) : (
                                <Link href={`/projects/${p.id}/docs/${d.id}`} className="truncate text-text-primary hover:underline">{d.label}</Link>
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
                        <ul className="space-y-0.5">
                          {p.tasks.map((t) => (
                            <li key={t.id}>
                              <button
                                type="button"
                                onClick={() => drawer?.openItem("milestone", t.id)}
                                className="w-full truncate text-left text-[12px] text-text-primary hover:text-[var(--blue-text)]"
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
                        <ul className="space-y-0.5">
                          {p.actionItems.map((a) => (
                            <li key={a.id}>
                              <button
                                type="button"
                                onClick={() => drawer?.openItem("action_item", a.id)}
                                className="w-full truncate text-left text-[12px] text-text-primary hover:text-[var(--blue-text)]"
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
    </DashCard>
  );
}
