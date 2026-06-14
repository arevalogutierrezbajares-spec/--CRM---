"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Check, Loader2, FileQuestion } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { previewKind } from "@/lib/project-files/allowed-types";
import { getFileTextAction, saveFileTextAction } from "@/app/(app)/lob/actions";

export type EditFileTarget = {
  linkId: string;
  label: string;
  filename: string;
};

const PROSE =
  "px-5 py-4 text-sm leading-relaxed text-text-secondary " +
  "[&_a]:text-[var(--blue-text)] [&_a]:underline " +
  "[&_blockquote]:border-l-2 [&_blockquote]:border-[var(--border)] [&_blockquote]:pl-3 [&_blockquote]:text-text-tertiary " +
  "[&_code]:rounded [&_code]:bg-surface [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] " +
  "[&_h1]:mb-3 [&_h1]:mt-1 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:text-text-primary " +
  "[&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-text-primary " +
  "[&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-text-primary " +
  "[&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 " +
  "[&_p]:my-2 [&_pre]:my-3 [&_pre]:overflow-auto [&_pre]:rounded [&_pre]:bg-surface [&_pre]:p-3 " +
  "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse " +
  "[&_td]:border [&_td]:border-[var(--border)] [&_td]:px-2 [&_td]:py-1 " +
  "[&_th]:border [&_th]:border-[var(--border)] [&_th]:bg-surface [&_th]:px-2 [&_th]:py-1 [&_th]:text-left " +
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5";

/**
 * Edit an uploaded text/markdown file's content in place. Loads the current
 * text from storage, shows a textarea (+ live preview for .md), and saves the
 * exact bytes back to the same storage object — the file stays a "file", so
 * download and open-in-tab are unchanged.
 */
export function EditFileContentModal({
  lobId,
  file,
  open,
  onOpenChange,
  onSaved,
}: {
  lobId: string;
  file: EditFileTarget | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [original, setOriginal] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isMarkdown = file ? previewKind(file.filename) === "markdown" : false;
  const dirty = text !== null && text !== original;

  // Load the file text when the modal opens. The parent remounts this component
  // per file (keyed on linkId), so initial state is fresh — no synchronous reset
  // needed (and setState only fires inside the async callback, per the
  // no-setState-in-effect rule).
  useEffect(() => {
    if (!open || !file) return;
    let cancelled = false;
    getFileTextAction({ linkId: file.linkId }).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setText(res.text);
        setOriginal(res.text);
      } else {
        setLoadError(res.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, file]);

  async function save() {
    if (!file || text === null) return;
    setSaving(true);
    const res = await saveFileTextAction({ lobId, linkId: file.linkId, text });
    setSaving(false);
    if (res.ok) {
      setOriginal(text);
      toast.success("Saved");
      onSaved?.();
      onOpenChange(false); // bypasses the unsaved-changes guard intentionally
    } else {
      toast.error(res.error);
    }
  }

  // Guard only user-initiated closes (Esc / overlay / X) when there are edits.
  // Event handlers see the current render's state, so `dirty` is up to date.
  function handleOpenChange(v: boolean) {
    if (!v && dirty && !window.confirm("Discard unsaved changes?")) {
      return;
    }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl gap-3 p-4">
        <DialogHeader className="pr-8">
          <DialogTitle className="truncate text-left">
            {file?.label ?? "Edit file"}
          </DialogTitle>
        </DialogHeader>

        <div className="h-[64vh] overflow-hidden rounded-md border border-[var(--border)] bg-surface">
          {loadError ? (
            <div className="grid h-full place-items-center px-6 text-center">
              <div>
                <FileQuestion className="mx-auto mb-2 h-7 w-7 text-text-tertiary" />
                <p className="text-sm text-text-secondary">{loadError}</p>
              </div>
            </div>
          ) : text === null ? (
            <div className="grid h-full place-items-center text-text-tertiary">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : isMarkdown ? (
            <div className="grid h-full grid-cols-2 divide-x divide-[var(--border)]">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
                className="h-full w-full resize-none bg-transparent px-4 py-3 font-mono text-[13px] leading-relaxed text-text-primary outline-none"
                placeholder="# Markdown…"
              />
              <div className="h-full overflow-auto">
                <div className={PROSE}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                </div>
              </div>
            </div>
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              className="h-full w-full resize-none bg-transparent px-4 py-3 font-mono text-[13px] leading-relaxed text-text-primary outline-none"
            />
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto text-tiny text-text-tertiary">
            {dirty ? "Unsaved changes" : saving ? "" : "Saved to the CRM"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={save}
            disabled={saving || !dirty || text === null}
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Saving
              </>
            ) : (
              <>
                <Check size={14} /> Save
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
