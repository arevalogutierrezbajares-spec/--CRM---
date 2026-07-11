"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Send } from "lucide-react";
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

type LocalMessage = RoomMessageView & { status?: "sending" | "failed" };

/**
 * Two-way thread between the visitor and the team. The server snapshot
 * (`initialMessages`) is the source of truth; locally-sent messages live in a
 * separate `pending` list and drop out once they appear in the snapshot, so the
 * thread never seeds-then-drifts. Sends are optimistic (bubble appears
 * immediately, "enviando…" → confirmed, failed sends offer a retry). Messages
 * group under day separators, and everything the team sent since the guest's
 * last visit sits under a "Nuevos desde tu última visita" divider.
 */
export function PublicRoomMessages({
  token,
  initialMessages,
  ownerLabel,
  mentionCandidates = [],
  lastSeenAtIso = null,
  nowMs,
}: {
  token: string;
  initialMessages: RoomMessageView[];
  ownerLabel: string;
  mentionCandidates?: string[];
  lastSeenAtIso?: string | null;
  nowMs?: number;
}) {
  const [pending, setPending] = useState<LocalMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Anchor the unread divider to the FIRST render of this visit — heartbeats
  // and refreshes bump lastViewedAt server-side, but "since your last visit"
  // shouldn't move while the guest is reading.
  const [unreadSince] = useState(lastSeenAtIso);
  const listRef = useRef<HTMLUListElement>(null);
  const tempIdRef = useRef(0);

  const serverIds = new Set(initialMessages.map((m) => m.id));
  const messages: LocalMessage[] = [
    ...initialMessages,
    ...pending.filter((m) => !serverIds.has(m.id)),
  ];

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function deliver(tempId: string, body: string) {
    try {
      const res = await fetch(`/api/access/${token}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        const saved = (await res.json()) as RoomMessageView;
        setPending((prev) =>
          prev.map((m) => (m.id === tempId ? { ...saved } : m)),
        );
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setPending((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m)),
        );
        setError(data.error ?? "No se pudo enviar. Inténtalo de nuevo.");
      }
    } catch {
      setPending((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m)),
      );
      setError("No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.");
    }
  }

  function send() {
    const body = draft.trim();
    if (!body) return;
    setError(null);
    tempIdRef.current += 1;
    const tempId = `tmp-${tempIdRef.current}`;
    // Optimistic bubble; the server response swaps in the real row.
    setPending((prev) => [
      ...prev,
      {
        id: tempId,
        body,
        authorKind: "partner",
        authorName: null,
        createdAt: new Date().toISOString(),
        status: "sending",
      },
    ]);
    setDraft("");
    void deliver(tempId, body);
  }

  function retry(message: LocalMessage) {
    setError(null);
    setPending((prev) =>
      prev.map((m) =>
        m.id === message.id ? { ...m, status: "sending" } : m,
      ),
    );
    void deliver(message.id, message.body);
  }

  const unreadSinceMs = unreadSince ? new Date(unreadSince).getTime() : null;
  // First team message newer than the last visit anchors the divider.
  const firstUnreadId =
    unreadSinceMs !== null
      ? messages.find(
          (m) =>
            m.authorKind !== "partner" &&
            new Date(m.createdAt).getTime() > unreadSinceMs,
        )?.id ?? null
      : null;

  return (
    <div className="space-y-3">
      {messages.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Aún no hay mensajes. Aquí van tus preguntas o notas para el equipo.
        </p>
      ) : (
        <ul ref={listRef} className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
          {messages.map((message, i) => {
            const mine = message.authorKind === "partner";
            const dayLabel = dayLabelFor(
              message.createdAt,
              i > 0 ? messages[i - 1].createdAt : null,
              nowMs,
            );
            return (
              <li key={message.id}>
                {dayLabel && (
                  <div className="my-3 flex items-center gap-3" aria-hidden>
                    <span className="h-px flex-1 bg-[var(--border)]" />
                    <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                      {dayLabel}
                    </span>
                    <span className="h-px flex-1 bg-[var(--border)]" />
                  </div>
                )}
                {message.id === firstUnreadId && (
                  <div className="my-3 flex items-center gap-3">
                    <span className="h-px flex-1 bg-amber-400/60" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                      Nuevos desde tu última visita
                    </span>
                    <span className="h-px flex-1 bg-amber-400/60" />
                  </div>
                )}
                <motion.div
                  initial={
                    message.status === "sending" ? { opacity: 0, y: 8 } : false
                  }
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className={mine ? "flex justify-end" : "flex"}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 ${
                      mine
                        ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                        : "bg-[var(--secondary)]"
                    } ${message.status === "sending" ? "opacity-70" : ""}`}
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
                      ·{" "}
                      {message.status === "sending"
                        ? "enviando…"
                        : message.status === "failed"
                          ? "no enviado"
                          : formatRelativeEs(message.createdAt)}
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">
                      {renderWithMentions(message.body)}
                    </p>
                    {message.status === "failed" && (
                      <button
                        type="button"
                        onClick={() => retry(message)}
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2"
                      >
                        <AlertCircle className="h-3 w-3" />
                        Reintentar
                      </button>
                    )}
                  </div>
                </motion.div>
              </li>
            );
          })}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-start gap-2"
      >
        <MentionTextarea
          value={draft}
          onChange={setDraft}
          onSubmit={send}
          candidates={mentionCandidates}
          placeholder="Escribe un mensaje… @ para mencionar"
          ariaLabel="Mensaje para el equipo"
          className="min-h-[44px] w-full resize-none rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base outline-none focus:ring-2 focus:ring-[var(--ring)] sm:text-sm"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Enviar mensaje"
          className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] transition hover:opacity-90 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="alert"
            className="text-xs text-[var(--destructive)]"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/** "Hoy" / "Ayer" / short date — only when the calendar day changes. */
function dayLabelFor(
  createdAt: string,
  prevCreatedAt: string | null,
  nowMs?: number,
) {
  const day = new Date(createdAt);
  if (prevCreatedAt) {
    const prev = new Date(prevCreatedAt);
    if (prev.toDateString() === day.toDateString()) return null;
  }
  if (nowMs !== undefined) {
    const now = new Date(nowMs);
    if (day.toDateString() === now.toDateString()) return "Hoy";
    const yesterday = new Date(nowMs - 24 * 60 * 60 * 1000);
    if (day.toDateString() === yesterday.toDateString()) return "Ayer";
  }
  return day.toLocaleDateString("es-VE", { day: "numeric", month: "short" });
}
