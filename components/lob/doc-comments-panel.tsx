"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MentionInput, type MentionSources, type PickedEntity } from "@/components/ui/mention-input";
import { personInBody, personToken } from "@/lib/nlp/mention-tokens";
import type { MemberOption } from "@/components/town-hall/types";
import {
  createDocCommentAction,
  deleteDocCommentAction,
  listDocCommentsAction,
} from "@/app/(app)/lob/doc-comment-actions";
import type { DocCommentMentionView, DocCommentView } from "@/db/queries/doc-comments";

/** Compact relative timestamp ("just now", "5m", "3h", "2d", else a date). */
function ago(d: Date): string {
  const secs = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (secs < 45) return "just now";
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h`;
  if (secs < 604800) return `${Math.round(secs / 86400)}d`;
  return new Date(d).toLocaleDateString();
}

/** Render a comment body, highlighting only the tokens that resolved to an
 *  actual mentioned teammate (so an email like a@b.com isn't styled). */
function CommentBody({ body, mentions }: { body: string; mentions: DocCommentMentionView[] }) {
  const tokens = new Set(mentions.map((m) => personToken(m.displayName).toLowerCase()));
  const parts = body.split(/(@[\p{L}\p{N}._-]+)/gu);
  return (
    <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-text-secondary">
      {parts.map((p, i) =>
        tokens.has(p.toLowerCase()) ? (
          <span key={i} className="font-medium" style={{ color: "var(--blue-text)" }}>
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

/**
 * Comment thread + @mention composer for a single document/file (a
 * project_links row). Mounted on the doc page and inside the file-preview
 * modal. Fetches its own comments on mount so a notification deep-link always
 * lands on a fresh thread. @mentioning a teammate notifies them (bell +
 * WhatsApp) so they can open the document.
 */
export function DocCommentsPanel({
  linkId,
  members,
  currentUserId,
  currentUserRole,
  className,
}: {
  linkId: string;
  members: MemberOption[];
  currentUserId: string;
  currentUserRole: "owner" | "admin" | "member";
  className?: string;
}) {
  const [comments, setComments] = useState<DocCommentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [picked, setPicked] = useState<MemberOption[]>([]);
  const [pickedAll, setPickedAll] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const isPrivileged = currentUserRole === "owner" || currentUserRole === "admin";
  const sources: MentionSources = { people: members, projects: [], docs: [] };

  useEffect(() => {
    // Each mount site keys by linkId, so a fresh instance starts with
    // loading=true — no synchronous setState needed here.
    let cancelled = false;
    listDocCommentsAction(linkId)
      .then((rows) => {
        if (!cancelled) setComments(rows);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load comments");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [linkId]);

  function onPick(e: PickedEntity) {
    if (e.kind === "all") {
      setPickedAll(true);
      return;
    }
    if (e.kind !== "person") return;
    setPicked((p) => (p.some((m) => m.userId === e.userId) ? p : [...p, { userId: e.userId, displayName: e.label }]));
  }

  const submit = useCallback(async () => {
    const body = text.trim();
    if (!body || submitting) return;
    // "@all" expands to every teammate (matches the Town Hall composer).
    const broadcast = pickedAll && /(^|\s)@all\b/i.test(body);
    if (broadcast && !confirm("Notify the whole team?")) return;
    setSubmitting(true);
    try {
      const mentionUserIds = broadcast
        ? members.map((m) => m.userId)
        : picked.filter((m) => personInBody(body, m.displayName)).map((m) => m.userId);
      const res = await createDocCommentAction({ linkId, body, mentionUserIds });
      if (!res.ok) {
        toast.error(res.error || "Could not post comment");
        return;
      }
      setComments((c) => [...c, res.comment]);
      setText("");
      setPicked([]);
      setPickedAll(false);
      if (res.notified > 0) {
        toast.success(
          `Comment posted · notified ${res.notified}${res.waSent > 0 ? ` · ${res.waSent} WhatsApp DM${res.waSent > 1 ? "s" : ""}` : ""}`,
        );
      }
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    } finally {
      setSubmitting(false);
    }
  }, [text, submitting, picked, pickedAll, members, linkId]);

  async function remove(id: string) {
    const prev = comments;
    setComments((c) => c.filter((x) => x.id !== id));
    const res = await deleteDocCommentAction(id);
    if (!res.ok) {
      setComments(prev);
      toast.error(res.error || "Could not delete");
    }
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 text-[13px] font-medium text-text-primary">
        <MessageSquare size={14} className="text-text-tertiary" />
        Comments
        {comments.length > 0 && <span className="text-text-tertiary">· {comments.length}</span>}
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-auto px-3 py-3">
        {loading ? (
          <div className="grid place-items-center py-8 text-text-tertiary">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-text-tertiary">
            No comments yet. @mention a teammate to loop them in.
          </p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="group">
              <div className="mb-0.5 flex items-baseline gap-2">
                <span className="text-[13px] font-medium text-text-primary">{c.authorName}</span>
                <span className="text-tiny text-text-tertiary">{ago(c.createdAt)}</span>
                {(c.authorId === currentUserId || isPrivileged) && (
                  <button
                    type="button"
                    onClick={() => void remove(c.id)}
                    className="ml-auto text-text-tertiary opacity-0 transition-opacity hover:text-[var(--red-text)] group-hover:opacity-100"
                    aria-label="Delete comment"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <CommentBody body={c.body} mentions={c.mentions} />
            </div>
          ))
        )}
      </div>

      <div className="border-t border-[var(--border)] p-2">
        <MentionInput
          multiline
          rows={2}
          value={text}
          onChange={setText}
          onPick={onPick}
          onSubmit={submit}
          sources={sources}
          aria-label="Write a comment"
          placeholder="Comment… @mention to notify. ⌘↵ to send."
          inputClassName="w-full resize-none rounded-md border border-[var(--input)] bg-transparent px-3 py-2 text-[13px] leading-relaxed placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        />
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={() => void submit()} loading={submitting} disabled={!text.trim()}>
            <Send className="h-3.5 w-3.5" /> Comment
          </Button>
        </div>
      </div>
    </div>
  );
}
