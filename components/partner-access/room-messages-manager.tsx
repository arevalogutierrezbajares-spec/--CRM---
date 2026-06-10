"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createRoomMessageAction,
  deleteRoomMessageAction,
} from "@/app/(app)/partner-access/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatRelative } from "@/lib/utils";
import {
  MentionTextarea,
  renderWithMentions,
} from "@/components/partner-access/mention-textarea";

export type RoomMessageRow = {
  id: string;
  body: string;
  authorKind: string;
  authorName: string | null;
  createdAt: string;
};

/**
 * Owner-side message thread. `initialMessages` (re-fetched on every
 * router.refresh) is the source of truth; locally-sent/optimistic messages live
 * in `pending` and drop out once they appear in the refreshed snapshot — so a
 * partner reply that lands between renders isn't masked by stale local state.
 */
export function RoomMessagesManager({
  roomId,
  initialMessages,
  partnerLabel,
  mentionCandidates = [],
}: {
  roomId: string;
  initialMessages: RoomMessageRow[];
  partnerLabel: string;
  mentionCandidates?: string[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<RoomMessageRow[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [saving, startTransition] = useTransition();
  const listRef = useRef<HTMLUListElement>(null);

  const serverIds = new Set(initialMessages.map((m) => m.id));
  const messages = [
    ...initialMessages,
    ...pending.filter((m) => !serverIds.has(m.id)),
  ].filter((m) => !removed.has(m.id));

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  function send() {
    const body = draft.trim();
    if (!body) return;
    startTransition(async () => {
      const res = await createRoomMessageAction({ roomId, body });
      if (res.ok) {
        setPending((prev) => [...prev, res.message]);
        setDraft("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function remove(messageId: string) {
    startTransition(async () => {
      const res = await deleteRoomMessageAction({ roomId, messageId });
      if (res.ok) {
        setRemoved((prev) => new Set(prev).add(messageId));
        setPending((prev) => prev.filter((m) => m.id !== messageId));
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }


  return (
    <div className="space-y-3">
      {messages.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          No messages yet. Anything you write here is visible to {partnerLabel}{" "}
          in their room.
        </p>
      ) : (
        <ul ref={listRef} className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {messages.map((message) => {
            const mine = message.authorKind === "owner";
            return (
              <li key={message.id} className={mine ? "flex justify-end" : "flex"}>
                <div
                  className={`group max-w-[85%] rounded-lg px-3 py-2 ${
                    mine
                      ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                      : "bg-[var(--secondary)]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11px] ${
                        mine
                          ? "text-[var(--primary-foreground)] opacity-70"
                          : "text-[var(--muted-foreground)]"
                      }`}
                    >
                      {message.authorName ?? (mine ? "You" : partnerLabel)} ·{" "}
                      {formatRelative(message.createdAt)}
                    </span>
                    <ConfirmDialog
                      title="Delete this message?"
                      description="It disappears from the client's room too."
                      confirmLabel="Delete"
                      destructive
                      onConfirm={() => remove(message.id)}
                      trigger={(open) => (
                        <button
                          type="button"
                          onClick={open}
                          disabled={saving}
                          aria-label="Delete message"
                          className="opacity-0 transition group-hover:opacity-70 focus-visible:opacity-70 hover:!opacity-100"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    />
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">
                    {renderWithMentions(message.body)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-start gap-2">
        <MentionTextarea
          value={draft}
          onChange={setDraft}
          onSubmit={send}
          candidates={mentionCandidates}
          placeholder={`Message ${partnerLabel}… @ to mention`}
          ariaLabel={`Message ${partnerLabel}`}
          className="min-h-[44px] w-full resize-none rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        <Button
          type="button"
          size="sm"
          className="h-[44px]"
          disabled={saving || !draft.trim()}
          onClick={send}
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
