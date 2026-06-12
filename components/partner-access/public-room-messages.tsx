"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { formatRelativeEs } from "@/lib/utils";
import {
  MentionTextarea,
  renderWithMentions,
} from "@/components/partner-access/mention-textarea";

export type RoomMessageView = {
  id: string;
  body: string;
  authorKind: string;
  authorName: string | null;
  createdAt: string;
};

/**
 * Two-way thread between the visitor and the team. The server snapshot
 * (`initialMessages`) is the source of truth; locally-sent messages live in a
 * separate `pending` list and drop out once they appear in the snapshot, so the
 * thread never seeds-then-drifts. Auto-scrolls to the newest message.
 */
export function PublicRoomMessages({
  token,
  initialMessages,
  ownerLabel,
  mentionCandidates = [],
}: {
  token: string;
  initialMessages: RoomMessageView[];
  ownerLabel: string;
  mentionCandidates?: string[];
}) {
  const [pending, setPending] = useState<RoomMessageView[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const serverIds = new Set(initialMessages.map((m) => m.id));
  const messages = [
    ...initialMessages,
    ...pending.filter((m) => !serverIds.has(m.id)),
  ];

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/access/${token}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        const saved = (await res.json()) as RoomMessageView;
        setPending((prev) => [...prev, saved]);
        setDraft("");
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "No se pudo enviar. Inténtalo de nuevo.");
      }
    } catch {
      setError("No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      {messages.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Aún no hay mensajes. Aquí van tus preguntas o notas para el equipo.
        </p>
      ) : (
        <ul ref={listRef} className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {messages.map((message) => {
            const mine = message.authorKind === "partner";
            return (
              <li key={message.id} className={mine ? "flex justify-end" : "flex"}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 ${
                    mine
                      ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                      : "bg-[var(--secondary)]"
                  }`}
                >
                  <div
                    className={`text-[11px] ${
                      mine
                        ? "text-[var(--primary-foreground)] opacity-70"
                        : "text-[var(--muted-foreground)]"
                    }`}
                  >
                    {mine
                      ? message.authorName ?? "Tú"
                      : message.authorName ?? ownerLabel}{" "}
                    · {formatRelativeEs(message.createdAt)}
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex items-start gap-2"
      >
        <MentionTextarea
          value={draft}
          onChange={setDraft}
          onSubmit={() => void send()}
          candidates={mentionCandidates}
          placeholder="Escribe un mensaje… @ para mencionar"
          ariaLabel="Mensaje para el equipo"
          className="min-h-[44px] w-full resize-none rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base outline-none focus:ring-2 focus:ring-[var(--ring)] sm:text-sm"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          aria-label="Enviar mensaje"
          className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] transition hover:opacity-90 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      {error && (
        <p role="alert" className="text-xs text-[var(--destructive)]">
          {error}
        </p>
      )}
    </div>
  );
}
