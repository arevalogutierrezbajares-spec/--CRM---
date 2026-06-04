"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Download, ExternalLink, Loader2, FileQuestion, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { previewKind, chipForFile } from "@/lib/project-files/allowed-types";

export type PreviewFile = {
  linkId: string;
  label: string;
  filename: string;
  mime: string;
};

/** Append Supabase's `download` param so the file saves with its real name. */
function downloadUrl(signedUrl: string, filename?: string): string {
  const sep = signedUrl.includes("?") ? "&" : "?";
  return `${signedUrl}${sep}download=${encodeURIComponent(filename ?? "")}`;
}

/**
 * In-app document viewer (option B). Presentational — the parent resolves the
 * short-lived signed URL (in an event handler, not an effect) and passes it in:
 *  - PDF / images / text render directly off the signed URL.
 *  - Office files (docx/xlsx/pptx) render through Microsoft's free Office web
 *    viewer, which fetches the signed URL itself — so it must be reachable for
 *    the URL's TTL. No infra, true Google-Docs-style preview.
 *  - Anything else falls back to a download prompt.
 */
export function FilePreviewModal({
  file,
  open,
  onOpenChange,
  url,
  error,
  loading,
  onEditDetails,
}: {
  file: PreviewFile | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  url: string | null;
  error: string | null;
  loading: boolean;
  /** Provided when the current user may rename/recategorize this file. */
  onEditDetails?: () => void;
}) {
  const kind = file ? previewKind(file.filename) : "none";
  const chip = file ? chipForFile(file.filename, file.mime) : "FILE";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl gap-3 p-4">
        <DialogHeader className="pr-8">
          <DialogTitle className="flex items-center gap-2 text-left">
            <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium text-text-secondary tabular-nums">
              {chip}
            </span>
            <span className="truncate">{file?.label}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="relative h-[72vh] w-full overflow-hidden rounded-md border border-[var(--border)] bg-surface">
          {loading && (
            <div className="absolute inset-0 grid place-items-center text-text-tertiary">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}

          {error && !loading && (
            <div className="absolute inset-0 grid place-items-center px-6 text-center">
              <div>
                <FileQuestion className="mx-auto mb-2 h-7 w-7 text-text-tertiary" />
                <p className="text-sm text-text-secondary">{error}</p>
              </div>
            </div>
          )}

          {url && !loading && file && (
            <PreviewBody kind={kind} url={url} label={file.label} />
          )}
        </div>

        <div className="flex items-center gap-2">
          {onEditDetails && (
            <Button type="button" variant="ghost" size="sm" onClick={onEditDetails}>
              <Pencil size={14} />
              Edit details
            </Button>
          )}
          <div className="flex flex-1 items-center justify-end gap-2">
          {url && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink size={14} />
                Open in new tab
              </Button>
              <Button type="button" size="sm" asChild>
                {/*
                  The signed URL is cross-origin (Supabase), so the <a download>
                  attribute is ignored by browsers. Force a Content-Disposition
                  attachment via Supabase's `download` query param, and keep
                  target=_blank so a click never navigates the app away even if
                  the param is dropped.
                */}
                <a
                  href={downloadUrl(url, file?.filename)}
                  download={file?.filename}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download size={14} />
                  Download
                </a>
              </Button>
            </>
          )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({
  kind,
  url,
  label,
}: {
  kind: ReturnType<typeof previewKind>;
  url: string;
  label: string;
}) {
  if (kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={label} className="h-full w-full object-contain" />;
  }

  if (kind === "markdown") {
    return <MarkdownPreview url={url} label={label} />;
  }

  if (kind === "pdf" || kind === "text") {
    return <iframe src={url} title={label} className="h-full w-full" />;
  }

  if (kind === "office") {
    const viewer = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(
      url,
    )}`;
    return <iframe src={viewer} title={label} className="h-full w-full" />;
  }

  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div>
        <FileQuestion className="mx-auto mb-2 h-7 w-7 text-text-tertiary" />
        <p className="text-sm text-text-secondary">
          No inline preview for this file type. Use download to open it.
        </p>
      </div>
    </div>
  );
}

/**
 * Markdown files render as formatted prose (GFM tables/lists/etc.). The text is
 * fetched from the signed URL in an effect — setState only fires inside the
 * async callback, never synchronously, to satisfy the no-setState-in-effect rule.
 * Falls back to the raw-text iframe if the fetch is blocked (e.g. CORS).
 */
function MarkdownPreview({ url, label }: { url: string; label: string }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((t) => {
        if (!cancelled) setText(t);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (failed) {
    return <iframe src={url} title={label} className="h-full w-full" />;
  }

  if (text === null) {
    return (
      <div className="grid h-full place-items-center text-text-tertiary">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="h-full w-full overflow-auto px-7 py-6 text-sm leading-relaxed text-text-secondary
        [&_a]:text-[var(--blue-text)] [&_a]:underline
        [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--border)] [&_blockquote]:pl-3 [&_blockquote]:text-text-tertiary
        [&_code]:rounded [&_code]:bg-surface [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px]
        [&_h1]:mb-3 [&_h1]:mt-1 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:text-text-primary
        [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-text-primary
        [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-text-primary
        [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5
        [&_p]:my-2 [&_pre]:my-3 [&_pre]:overflow-auto [&_pre]:rounded [&_pre]:bg-surface [&_pre]:p-3
        [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse
        [&_td]:border [&_td]:border-[var(--border)] [&_td]:px-2 [&_td]:py-1
        [&_th]:border [&_th]:border-[var(--border)] [&_th]:bg-surface [&_th]:px-2 [&_th]:py-1 [&_th]:text-left
        [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
