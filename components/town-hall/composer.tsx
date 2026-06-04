"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createPostAction } from "@/app/(app)/town-hall/actions";
import type { MemberOption, RefObject } from "./types";

type ActiveTrigger =
  | { kind: "@"; query: string; start: number }
  | { kind: "#"; query: string; start: number }
  | null;

/**
 * Detect an in-progress @ or # token immediately left of the caret.
 * Returns the trigger kind, the query typed so far, and the index of the
 * trigger char (so we can splice a completion in).
 */
function detectTrigger(text: string, caret: number): ActiveTrigger {
  const upto = text.slice(0, caret);
  const m = upto.match(/(^|\s)([@#])([a-zA-Z0-9._-]*)$/);
  if (!m) return null;
  const kind = m[2] as "@" | "#";
  const query = m[3] ?? "";
  const start = caret - query.length - 1; // index of the @ or #
  return { kind, query, start };
}

export function Composer({
  members,
  objects,
  onPosted,
}: {
  members: MemberOption[];
  objects: RefObject[];
  onPosted: () => void;
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  // Resolved tokens chosen from the autocomplete (best-effort; the server also
  // re-parses the body so hand-typed @names still resolve).
  const [pickedMentions, setPickedMentions] = useState<MemberOption[]>([]);
  const [pickedRefs, setPickedRefs] = useState<RefObject[]>([]);

  const trigger = useMemo(() => detectTrigger(text, caret), [text, caret]);

  const memberSuggestions = useMemo(() => {
    if (!trigger || trigger.kind !== "@") return [];
    const q = trigger.query.toLowerCase();
    return members
      .filter((m) => m.displayName.toLowerCase().includes(q))
      .slice(0, 6);
  }, [trigger, members]);

  const objectSuggestions = useMemo(() => {
    if (!trigger || trigger.kind !== "#") return [];
    const q = trigger.query.toLowerCase();
    return objects
      .filter((o) => o.label.toLowerCase().includes(q))
      .slice(0, 6);
  }, [trigger, objects]);

  const syncCaret = useCallback(() => {
    const ta = taRef.current;
    if (ta) setCaret(ta.selectionStart ?? 0);
  }, []);

  const insertMention = useCallback(
    (m: MemberOption) => {
      if (!trigger) return;
      const token = `@${m.displayName.replace(/\s+/g, "")}`;
      const before = text.slice(0, trigger.start);
      const after = text.slice(caret);
      const next = `${before}${token} ${after}`;
      setText(next);
      setPickedMentions((prev) =>
        prev.some((p) => p.userId === m.userId) ? prev : [...prev, m],
      );
      const newCaret = before.length + token.length + 1;
      // Refocus + place caret after the inserted token.
      requestAnimationFrame(() => {
        const ta = taRef.current;
        if (ta) {
          ta.focus();
          ta.setSelectionRange(newCaret, newCaret);
          setCaret(newCaret);
        }
      });
    },
    [trigger, text, caret],
  );

  const insertRef = useCallback(
    (o: RefObject) => {
      if (!trigger) return;
      const token = `#${o.label}`;
      const before = text.slice(0, trigger.start);
      const after = text.slice(caret);
      const next = `${before}${token} ${after}`;
      setText(next);
      setPickedRefs((prev) =>
        prev.some((p) => p.refId === o.refId && p.refType === o.refType)
          ? prev
          : [...prev, o],
      );
      const newCaret = before.length + token.length + 1;
      requestAnimationFrame(() => {
        const ta = taRef.current;
        if (ta) {
          ta.focus();
          ta.setSelectionRange(newCaret, newCaret);
          setCaret(newCaret);
        }
      });
    },
    [trigger, text, caret],
  );

  const submit = useCallback(async () => {
    const body = text.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    try {
      // Only keep picked tokens whose literal still appears in the body.
      const mentionUserIds = pickedMentions
        .filter((m) =>
          body
            .toLowerCase()
            .includes(`@${m.displayName.replace(/\s+/g, "").toLowerCase()}`),
        )
        .map((m) => m.userId);
      const refs = pickedRefs
        .filter((r) => body.toLowerCase().includes(`#${r.label.toLowerCase()}`))
        .map((r) => ({ refType: r.refType, refId: r.refId, label: r.label }));

      const res = await createPostAction({ body, mentionUserIds, refs });
      if (!res.ok) {
        toast.error(res.error || "Could not post");
        return;
      }
      setText("");
      setCaret(0);
      setPickedMentions([]);
      setPickedRefs([]);
      if (res.notified > 0) {
        toast.success(
          `Posted · notified ${res.notified}${
            res.waSent > 0 ? ` · ${res.waSent} WhatsApp DM${res.waSent > 1 ? "s" : ""}` : ""
          }`,
        );
      }
      onPosted();
    } finally {
      setSubmitting(false);
    }
  }, [text, submitting, pickedMentions, pickedRefs, onPosted]);

  const showSuggest =
    trigger &&
    ((trigger.kind === "@" && memberSuggestions.length > 0) ||
      (trigger.kind === "#" && objectSuggestions.length > 0));

  return (
    <div className="rounded-lg border bg-card p-3" style={{ borderColor: "var(--border)" }}>
      <div className="relative">
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart ?? 0);
          }}
          onKeyUp={syncCaret}
          onClick={syncCaret}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          rows={3}
          placeholder="Share an update… @mention people, #reference a project. ⌘↵ to post."
          className="w-full resize-none rounded-md border border-[var(--input)] bg-transparent px-3 py-2 text-[13px] leading-relaxed placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        />

        {showSuggest && (
          <div
            className="absolute left-2 right-2 top-full z-20 mt-1 max-h-56 overflow-auto rounded-md border bg-[var(--popover)] p-1 shadow-md"
            style={{ borderColor: "var(--border)" }}
          >
            {trigger?.kind === "@"
              ? memberSuggestions.map((m) => (
                  <button
                    key={m.userId}
                    type="button"
                    onClick={() => insertMention(m)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-surface"
                  >
                    <span
                      className="font-medium"
                      style={{ color: "var(--blue-text)" }}
                    >
                      @{m.displayName}
                    </span>
                  </button>
                ))
              : objectSuggestions.map((o) => (
                  <button
                    key={`${o.refType}:${o.refId}`}
                    type="button"
                    onClick={() => insertRef(o)}
                    className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-surface"
                  >
                    <span className="truncate">#{o.label}</span>
                    <span className="text-tiny uppercase text-text-tertiary">
                      {o.refType.replace("_", " ")}
                    </span>
                  </button>
                ))}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-tiny text-text-tertiary">
          Type <span className="font-mono">@</span> for people,{" "}
          <span className="font-mono">#</span> for objects.
        </span>
        <Button
          size="sm"
          onClick={() => void submit()}
          loading={submitting}
          disabled={!text.trim()}
        >
          <Send className="h-3.5 w-3.5" /> Post
        </Button>
      </div>
    </div>
  );
}
