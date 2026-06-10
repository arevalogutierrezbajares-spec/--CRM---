"use client";

import { useState } from "react";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { formatRelative } from "@/lib/utils";

export type RepoComment = {
  id: string;
  body: string;
  authorKind: string;
  authorName: string | null;
  createdAt: string;
};

/**
 * Collapsible comment thread for a single repository entry. Server comments are
 * the source of truth; locally-posted comments live in `pending` and drop out
 * once the server snapshot includes them (works for both refresh-backed owner
 * and fetch-only guest contexts).
 */
export function PartnerCommentThread({
  comments,
  onSubmit,
  onDelete,
  ownerLabel = "Team",
}: {
  comments: RepoComment[];
  onSubmit: (body: string) => Promise<RepoComment | null>;
  onDelete?: (id: string) => Promise<void>;
  ownerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<RepoComment[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const serverIds = new Set(comments.map((c) => c.id));
  const merged = [...comments, ...pending.filter((c) => !serverIds.has(c.id))];

  async function send() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const saved = await onSubmit(body);
      if (saved) {
        setPending((p) => [...p, saved]);
        setDraft("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md text-xs text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        {merged.length > 0
          ? `${merged.length} comment${merged.length === 1 ? "" : "s"}`
          : "Add comment"}
      </button>

      {open && (
        <div className="mt-2 space-y-2 border-l-2 border-[var(--border)] pl-3">
          {merged.map((c) => (
            <div key={c.id} className="group text-sm">
              <div className="flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
                <span className="font-medium text-[var(--foreground)]">
                  {c.authorName ?? (c.authorKind === "owner" ? ownerLabel : "Guest")}
                </span>
                {formatRelative(c.createdAt)}
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => void onDelete(c.id)}
                    aria-label="Delete comment"
                    className="opacity-0 transition group-hover:opacity-70 hover:!opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words">{c.body}</p>
            </div>
          ))}

          <div className="flex items-start gap-2 pt-1">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder="Add a comment…"
              aria-label="Add a comment"
              className="min-h-[36px] flex-1 resize-none rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
            <button
              type="button"
              onClick={send}
              disabled={busy || !draft.trim()}
              aria-label="Send comment"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] transition hover:opacity-90 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
