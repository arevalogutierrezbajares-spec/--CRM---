"use client";

import { useCallback, useState } from "react";
import { Sparkles, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  extractActionItemsAction,
  commitActionItemsAction,
  type ExtractedSuggestion,
} from "@/app/(app)/town-hall/actions";

type Row = ExtractedSuggestion & { include: boolean };

/**
 * Paste meeting notes → AI extracts action items → user reviews/toggles each →
 * confirm commits them as real action items. Two-phase: extract, then confirm.
 */
export function ExtractNotesDialog({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState<"input" | "review">("input");
  const [extracting, setExtracting] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  const reset = useCallback(() => {
    setNotes("");
    setPhase("input");
    setRows([]);
    setExtracting(false);
    setCommitting(false);
  }, []);

  const runExtract = useCallback(async () => {
    setExtracting(true);
    try {
      const res = await extractActionItemsAction(notes);
      if (!res.ok) {
        toast.error(res.error || "Extraction failed");
        return;
      }
      if (res.suggestions.length === 0) {
        toast.message("No action items found in those notes.");
        return;
      }
      setRows(res.suggestions.map((s) => ({ ...s, include: true })));
      setPhase("review");
    } finally {
      setExtracting(false);
    }
  }, [notes]);

  const commit = useCallback(async () => {
    const chosen = rows.filter((r) => r.include);
    if (chosen.length === 0) {
      toast.error("Select at least one item.");
      return;
    }
    setCommitting(true);
    try {
      const res = await commitActionItemsAction(
        chosen.map((r) => ({
          title: r.title,
          description: r.description,
          assigneeUserId: r.assigneeUserId,
          projectId: r.projectId,
          priority: r.priority,
        })),
      );
      if (!res.ok) {
        toast.error(res.error || "Could not create items");
        return;
      }
      toast.success(`Created ${res.created} action item${res.created === 1 ? "" : "s"}`);
      setOpen(false);
      reset();
    } finally {
      setCommitting(false);
    }
  }, [rows, reset]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="sm:h-8">
          <Sparkles className="h-3.5 w-3.5" /> Notes → action items
        </Button>
      </DialogTrigger>
      <DialogContent className="!bottom-0 !left-0 !right-0 !top-auto !max-h-[92dvh] !max-w-none !translate-x-0 !translate-y-0 !gap-0 overflow-hidden rounded-t-xl !p-0 sm:!bottom-auto sm:!left-1/2 sm:!right-auto sm:!top-1/2 sm:!max-h-[85vh] sm:!max-w-2xl sm:!-translate-x-1/2 sm:!-translate-y-1/2 sm:rounded-lg">
        <div className="flex max-h-[92dvh] flex-col sm:max-h-[85vh]">
          <DialogHeader className="px-4 pb-3 pt-5 pr-14 text-left sm:px-6 sm:pt-6">
            <DialogTitle>Extract action items from notes</DialogTitle>
            <DialogDescription>
              Paste raw meeting notes. The AI pulls out concrete to-dos with a
              suggested owner and project — confirm before they’re created.
            </DialogDescription>
          </DialogHeader>

          {phase === "input" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 px-4 sm:px-6">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={10}
                  placeholder="Paste meeting notes here…"
                  className="min-h-[260px] w-full resize-y rounded-md border border-[var(--input)] bg-transparent px-3 py-3 text-[13px] leading-relaxed placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                />
              </div>
              <div className="sticky bottom-0 mt-4 flex justify-end border-t border-[var(--border)] bg-[var(--background)] px-4 py-3 sm:px-6">
                <Button
                  size="sm"
                  className="min-w-[120px]"
                  onClick={() => void runExtract()}
                  loading={extracting}
                  loadingText="Extracting…"
                  disabled={notes.trim().length < 4}
                >
                  <Sparkles className="h-3.5 w-3.5" /> Extract
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-2 overflow-auto px-4 sm:px-6">
                {rows.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-md border bg-card p-3"
                    style={{
                      borderColor: "var(--border)",
                      opacity: r.include ? 1 : 0.5,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setRows((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, include: !x.include } : x,
                          ),
                        )
                      }
                      className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-md border"
                      style={{ borderColor: "var(--border)" }}
                      aria-label={r.include ? "Exclude" : "Include"}
                    >
                      {r.include ? (
                        <Check className="h-4 w-4" style={{ color: "var(--blue-text)" }} />
                      ) : (
                        <X className="h-4 w-4 text-text-tertiary" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <input
                        value={r.title}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, title: e.target.value } : x,
                            ),
                          )
                        }
                        className="min-h-[44px] w-full bg-transparent text-[13px] font-medium text-text-primary focus-visible:outline-none"
                      />
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-tiny text-text-tertiary">
                        {r.assigneeName && (
                          <span
                            className="rounded px-1.5 py-0.5"
                            style={{ background: "var(--surface)" }}
                          >
                            @{r.assigneeName}
                          </span>
                        )}
                        {r.projectTitle && (
                          <span
                            className="rounded px-1.5 py-0.5"
                            style={{ background: "var(--surface)" }}
                          >
                            #{r.projectTitle}
                          </span>
                        )}
                        {r.priority && (
                          <span className="uppercase">{r.priority}</span>
                        )}
                        {r.description && (
                          <span className="truncate">· {r.description}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="sticky bottom-0 mt-4 flex items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--background)] px-4 py-3 sm:px-6">
                <Button variant="ghost" size="sm" onClick={() => setPhase("input")}>
                  Back
                </Button>
                <Button
                  size="sm"
                  onClick={() => void commit()}
                  loading={committing}
                  loadingText="Creating…"
                >
                  <Check className="h-3.5 w-3.5" /> Create{" "}
                  {rows.filter((r) => r.include).length} item
                  {rows.filter((r) => r.include).length === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
