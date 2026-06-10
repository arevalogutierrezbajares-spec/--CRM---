"use client";

import {
  ArrowUpRight,
  Download,
  FileText,
  Film,
  ImageIcon,
  LinkIcon,
} from "lucide-react";
import { formatBytes } from "@/lib/project-files/limits";
import {
  PartnerCommentThread,
  type RepoComment,
} from "@/components/partner-access/partner-comment-thread";

export type RepoShare = {
  id: string;
  title: string;
  description: string | null;
  projectTitle: string | null;
  kindSnapshot: string;
  permissions: string[];
  sizeBytes: number | null;
  isHtmlDeck: boolean;
  isLink: boolean;
  urlSnapshot: string | null;
  canDownload: boolean;
};

export type RepoItem = {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

function mediaKind(mime: string | null): "image" | "video" | "none" {
  if (!mime) return "none";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "none";
}

const KIND_LABEL: Record<string, string> = {
  file: "Document",
  link: "Link",
  doc: "Document",
  note: "Note",
};
function kindLabel(kind: string) {
  return KIND_LABEL[kind] ?? "Document";
}

export function PublicRepository({
  token,
  shares,
  items,
  commentsByTarget,
  ownerLabel,
}: {
  token: string;
  shares: RepoShare[];
  items: RepoItem[];
  commentsByTarget: Record<string, RepoComment[]>;
  ownerLabel: string;
}) {
  async function postComment(targetKind: "share" | "item", targetId: string, body: string) {
    const res = await fetch(`/api/access/${token}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetKind, targetId, body }),
    }).catch(() => null);
    if (!res || !res.ok) return null;
    return (await res.json()) as RepoComment;
  }

  const empty = shares.length === 0 && items.length === 0;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div>
          <h2 className="text-base font-semibold">Repository</h2>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            Documents, links, and media shared with you — comment on anything.
          </p>
        </div>
        <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs text-[var(--secondary-foreground)]">
          {shares.length + items.length}
        </span>
      </div>

      {empty ? (
        <div className="p-5">
          <p className="rounded-lg border border-dashed border-[var(--border)] p-5 text-sm text-[var(--muted-foreground)]">
            Nothing here yet. New documents and links will appear in this space.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {items.map((item) => {
            const mk = mediaKind(item.mimeType);
            const comments = commentsByTarget[`item:${item.id}`] ?? [];
            return (
              <li key={`item-${item.id}`} className="p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--secondary)]">
                    {item.kind === "link" ? (
                      <LinkIcon className="h-4 w-4 text-[var(--muted-foreground)]" />
                    ) : mk === "image" ? (
                      <ImageIcon className="h-4 w-4 text-[var(--muted-foreground)]" />
                    ) : mk === "video" ? (
                      <Film className="h-4 w-4 text-[var(--muted-foreground)]" />
                    ) : (
                      <FileText className="h-4 w-4 text-[var(--muted-foreground)]" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="text-sm font-medium">{item.title}</h3>
                      {item.kind === "link" && item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--secondary)]"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                          Open
                        </a>
                      ) : item.kind === "file" && mk === "none" ? (
                        <a
                          href={`/access/${token}/item/${item.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--secondary)]"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Open
                        </a>
                      ) : null}
                    </div>
                    {item.sizeBytes ? (
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {formatBytes(item.sizeBytes)}
                      </p>
                    ) : null}
                    {item.description && (
                      <p className="mt-1.5 text-sm leading-6 text-[var(--muted-foreground)]">
                        {item.description}
                      </p>
                    )}

                    {item.kind === "file" && mk === "image" && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`/access/${token}/item/${item.id}`}
                        alt={item.title}
                        className="mt-2 max-h-72 rounded-lg border border-[var(--border)] object-contain"
                      />
                    )}
                    {item.kind === "file" && mk === "video" && (
                      <video
                        controls
                        src={`/access/${token}/item/${item.id}`}
                        className="mt-2 max-h-72 w-full rounded-lg border border-[var(--border)]"
                      />
                    )}

                    <PartnerCommentThread
                      comments={comments}
                      ownerLabel={ownerLabel}
                      onSubmit={(body) => postComment("item", item.id, body)}
                    />
                  </div>
                </div>
              </li>
            );
          })}

          {shares.map((share) => {
            const comments = commentsByTarget[`share:${share.id}`] ?? [];
            return (
              <li key={`share-${share.id}`} className="p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--secondary)]">
                    {share.isLink ? (
                      <LinkIcon className="h-4 w-4 text-[var(--muted-foreground)]" />
                    ) : (
                      <FileText className="h-4 w-4 text-[var(--muted-foreground)]" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium">{share.title}</h3>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {share.projectTitle ?? "Project"} · {kindLabel(share.kindSnapshot)}
                          {share.sizeBytes ? ` · ${formatBytes(share.sizeBytes)}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {share.isLink && share.urlSnapshot && (
                          <a
                            href={`/access/${token}/open/${share.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--secondary)]"
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" />
                            Open
                          </a>
                        )}
                        {share.isHtmlDeck && (
                          <a
                            href={`/access/${token}/deck/${share.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--secondary)]"
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" />
                            View deck
                          </a>
                        )}
                        {share.canDownload && (
                          <a
                            href={`/access/${token}/download/${share.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md bg-[var(--primary)] px-2 py-1 text-xs text-[var(--primary-foreground)] hover:opacity-90"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download
                          </a>
                        )}
                      </div>
                    </div>
                    {share.description && (
                      <p className="mt-1.5 text-sm leading-6 text-[var(--muted-foreground)]">
                        {share.description}
                      </p>
                    )}
                    <PartnerCommentThread
                      comments={comments}
                      ownerLabel={ownerLabel}
                      onSubmit={(body) => postComment("share", share.id, body)}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
