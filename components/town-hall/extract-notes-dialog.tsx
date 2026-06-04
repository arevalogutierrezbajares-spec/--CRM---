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
export function ExtractNotesDialog() {
  const [open, setOpen] = useState(false);
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
        <Button variant="outline" size="sm">
          <Sparkles className="h-3.5 w-3.5" /> Notes → action items
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Extract action items from notes</DialogTitle>
          <DialogDescription>
            Paste raw meeting notes. The AI pulls out concrete to-dos with a
            suggested owner and project — confirm before they’re created.
          </DialogDescription>
        </DialogHeader>

        {phase === "input" ? (
          <div className="space-y-3">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={10}
              placeholder="Paste meeting notes here…"
              className="w-full resize-y rounded-md border border-[var(--input)] bg-transparent px-3 py-2 text-[13px] leading-relaxed placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
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
          <div className="space-y-3">
            <div className="max-h-[50vh] space-y-2 overflow-auto">
              {rows.map((r, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-md border bg-card p-2.5"
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
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border"
                    style={{ borderColor: "var(--border)" }}
                    aria-label={r.include ? "Exclude" : "Include"}
                  >
                    {r.include ? (
                      <Check className="h-3.5 w-3.5" style={{ color: "var(--blue-text)" }} />
                    ) : (
                      <X className="h-3.5 w-3.5 text-text-tertiary" />
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
                      className="w-full bg-transparent text-[13px] font-medium text-text-primary focus-visible:outline-none"
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
            <div className="flex items-center justify-between">
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
      </DialogContent>
    </Dialog>
  );
}
