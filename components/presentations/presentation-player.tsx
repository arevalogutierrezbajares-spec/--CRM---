"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  MessageSquarePlus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { Slide } from "@/lib/presentations/types";
import type { PresentationKind, SlideMapEntry } from "@/db/queries/presentations";
import {
  addCommentAction,
  addCommentByTokenAction,
  resolveCommentAction,
  deleteCommentAction,
} from "@/app/(app)/presentations/actions";
import { SlideView } from "./slide-view";

export type PlayerComment = {
  id: string;
  slideId: string;
  xPct: number;
  yPct: number;
  body: string;
  authorName: string;
  resolvedAt: string | Date | null;
  createdAt: string | Date;
};

type Draft = { slideId: string; xPct: number; yPct: number } | null;

export function PresentationPlayer({
  presentationId,
  slides,
  initialComments,
  mode,
  token,
  allowComments,
  backHref,
  shareSlot,
  kind = "structured",
  slideMap = [],
}: {
  presentationId: string;
  slides: Slide[];
  initialComments: PlayerComment[];
  mode: "internal" | "external";
  token?: string;
  allowComments: boolean;
  backHref?: string;
  shareSlot?: React.ReactNode;
  kind?: PresentationKind;
  slideMap?: SlideMapEntry[];
}) {
  const [index, setIndex] = useState(0);
  const [comments, setComments] = useState<PlayerComment[]>(initialComments);
  const [commentMode, setCommentMode] = useState(false);
  const [draft, setDraft] = useState<Draft>(null);
  const [draftBody, setDraftBody] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [authorName, setAuthorName] = useState("");
  const [saving, setSaving] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  // 'html' decks are rendered as a single document in a sandboxed <iframe>;
  // the nav/comment rail is driven by slideMap (anchor id/label pairs)
  // instead of the structured Slide[] array. Kept as thin normalization on
  // top of the existing index/slide-id logic below — the structured render
  // path (SlideView) is untouched.
  const isHtml = kind === "html";
  const navItems = useMemo(
    () =>
      isHtml
        ? slideMap.map((m) => ({ id: m.slideId, label: m.label }))
        : slides.map((s) => ({ id: s.id, label: s.title || s.eyebrow || s.id })),
    [isHtml, slideMap, slides],
  );
  const htmlSrc =
    mode === "internal"
      ? `/presentations/${presentationId}/html`
      : `/p/${token}/html`;

  const count = navItems.length;
  const slide = isHtml ? undefined : slides[index];
  const activeSlideId = isHtml ? navItems[index]?.id : slide?.id;

  // External commenters identify themselves once; remember it locally.
  useEffect(() => {
    if (mode !== "external") return;
    // Defer setState out of the effect body (rAF) to satisfy the
    // no-setState-in-effect rule and avoid a hydration mismatch.
    const raf = requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem("pres_author_name");
        if (saved) setAuthorName(saved);
      } catch {
        /* ignore */
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  const go = useCallback(
    (n: number) => {
      setIndex(Math.max(0, Math.min(count - 1, n)));
      setDraft(null);
      setOpenId(null);
    },
    [count],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (draft || openId) return; // don't navigate while writing/reading
      if (["ArrowRight", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        go(index + 1);
      } else if (["ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault();
        go(index - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, draft, openId]);

  const slideComments = useMemo(
    () => comments.filter((c) => c.slideId === activeSlideId),
    [comments, activeSlideId],
  );

  function onStageClick(e: React.MouseEvent) {
    if (!commentMode || !activeSlideId) return;
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const yPct = (e.clientY - rect.top) / rect.height;
    if (xPct < 0 || xPct > 1 || yPct < 0 || yPct > 1) return;
    setOpenId(null);
    setDraft({ slideId: activeSlideId, xPct, yPct });
    setDraftBody("");
  }

  async function submitDraft() {
    if (!draft) return;
    const body = draftBody.trim();
    if (!body) {
      toast.error("Write a comment first");
      return;
    }
    if (mode === "external" && !authorName.trim()) {
      toast.error("Add your name first");
      return;
    }
    setSaving(true);
    const payload = {
      slideId: draft.slideId,
      xPct: draft.xPct,
      yPct: draft.yPct,
      body,
    };
    const res =
      mode === "external"
        ? await addCommentByTokenAction(token!, {
            ...payload,
            authorName: authorName.trim(),
          })
        : await addCommentAction(presentationId, payload);
    setSaving(false);
    if (res.ok) {
      setComments((cs) => [...cs, res.comment]);
      setDraft(null);
      setDraftBody("");
      if (mode === "external") {
        try {
          localStorage.setItem("pres_author_name", authorName.trim());
        } catch {
          /* ignore */
        }
      }
    } else {
      toast.error(res.error);
    }
  }

  async function resolve(c: PlayerComment) {
    const next = c.resolvedAt ? null : new Date().toISOString();
    setComments((cs) =>
      cs.map((x) => (x.id === c.id ? { ...x, resolvedAt: next } : x)),
    );
    const res = await resolveCommentAction(c.id, !c.resolvedAt);
    if (!res.ok) {
      toast.error(res.error);
      setComments((cs) =>
        cs.map((x) => (x.id === c.id ? { ...x, resolvedAt: c.resolvedAt } : x)),
      );
    }
  }

  async function remove(c: PlayerComment) {
    const prev = comments;
    setComments((cs) => cs.filter((x) => x.id !== c.id));
    setOpenId(null);
    const res = await deleteCommentAction(c.id);
    if (!res.ok) {
      toast.error(res.error);
      setComments(prev);
    }
  }

  if (count === 0 || !activeSlideId || (!isHtml && !slide)) {
    return (
      <div className="flex h-dvh items-center justify-center bg-black text-white/60">
        This presentation has no slides yet.
      </div>
    );
  }

  const openComment = comments.find((c) => c.id === openId) ?? null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-neutral-950">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-white">
        <div className="flex items-center gap-3">
          {backHref && (
            <a
              href={backHref}
              className="text-xs text-white/50 transition-colors hover:text-white"
            >
              ← Back
            </a>
          )}
          <div className="text-xs text-white/50 tabular-nums">
            {index + 1} / {count}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {shareSlot}
          {allowComments && (
            <button
              type="button"
              onClick={() => {
                setCommentMode((v) => !v);
                setDraft(null);
              }}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                commentMode
                  ? "bg-white text-black"
                  : "bg-white/10 text-white/80 hover:bg-white/20"
              }`}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              {commentMode ? "Click to comment" : "Comment"}
            </button>
          )}
        </div>
      </div>

      {/* Stage */}
      <div className="flex flex-1 items-center justify-center overflow-hidden px-3 pb-3">
        <div
          ref={stageRef}
          onClick={onStageClick}
          className={`relative aspect-video w-full max-w-[1200px] overflow-hidden rounded-xl shadow-2xl ${
            commentMode ? "cursor-crosshair" : ""
          }`}
        >
          {isHtml ? (
            <>
              <iframe
                key={presentationId}
                src={`${htmlSrc}#${encodeURIComponent(activeSlideId)}`}
                sandbox="allow-scripts allow-popups allow-forms"
                title="Presentation"
                className="h-full w-full border-0 bg-white"
              />
              {/* Iframe content is a separate browsing context and swallows
                  clicks before they reach onStageClick — an invisible layer
                  intercepts placement clicks only while comment mode is on,
                  so normal deck interaction (links, scroll) is unaffected. */}
              {commentMode && <div className="absolute inset-0 z-10" />}
            </>
          ) : (
            <SlideView slide={slide!} />
          )}

          {/* Existing pins */}
          {slideComments.map((c, i) => {
            const resolved = Boolean(c.resolvedAt);
            return (
              <button
                key={c.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenId((o) => (o === c.id ? null : c.id));
                  setDraft(null);
                }}
                style={{ left: `${c.xPct * 100}%`, top: `${c.yPct * 100}%` }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 ${
                  resolved ? "opacity-50" : ""
                }`}
                aria-label={`Comment by ${c.authorName}`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full rounded-bl-none text-[11px] font-semibold shadow-md ring-2 ring-white ${
                    resolved
                      ? "bg-neutral-400 text-white"
                      : "bg-amber-400 text-black"
                  }`}
                >
                  {resolved ? <Check className="h-3 w-3" /> : i + 1}
                </span>
              </button>
            );
          })}

          {/* Draft pin + composer */}
          {draft && draft.slideId === activeSlideId && (
            <div
              style={{ left: `${draft.xPct * 100}%`, top: `${draft.yPct * 100}%` }}
              className="absolute z-30 -translate-x-1/2"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="mb-1 block h-6 w-6 -translate-x-1/2 rounded-full rounded-bl-none bg-amber-400 ring-2 ring-white" />
              <div className="w-64 rounded-lg border border-black/10 bg-white p-2.5 shadow-xl">
                {mode === "external" && (
                  <input
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    placeholder="Your name"
                    className="mb-1.5 w-full rounded-md border border-black/10 px-2 py-1 text-sm text-black outline-none"
                  />
                )}
                <textarea
                  autoFocus
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitDraft();
                    if (e.key === "Escape") setDraft(null);
                  }}
                  placeholder="Leave feedback…"
                  rows={3}
                  className="w-full resize-none rounded-md border border-black/10 px-2 py-1 text-sm text-black outline-none"
                />
                <div className="mt-1.5 flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDraft(null)}
                    className="rounded-md px-2 py-1 text-xs text-black/60 hover:bg-black/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitDraft}
                    disabled={saving}
                    className="rounded-md bg-black px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Comment
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Open comment popover */}
          {openComment && openComment.slideId === activeSlideId && (
            <div
              style={{
                left: `${openComment.xPct * 100}%`,
                top: `${openComment.yPct * 100}%`,
              }}
              className="absolute z-30 -translate-x-1/2"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="mb-1 block h-6 w-6 -translate-x-1/2" />
              <div className="w-64 rounded-lg border border-black/10 bg-white p-3 shadow-xl">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-black">
                    {openComment.authorName}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpenId(null)}
                    className="text-black/40 hover:text-black"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-black/80">
                  {openComment.body}
                </p>
                {mode === "internal" && (
                  <div className="mt-2 flex items-center gap-2 border-t border-black/5 pt-2">
                    <button
                      type="button"
                      onClick={() => resolve(openComment)}
                      className="flex items-center gap-1 text-xs text-black/60 hover:text-black"
                    >
                      <Check className="h-3.5 w-3.5" />
                      {openComment.resolvedAt ? "Reopen" : "Resolve"}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(openComment)}
                      className="ml-auto flex items-center gap-1 text-xs text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Nav arrows */}
          {index > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(index - 1);
              }}
              className="absolute left-3 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur transition hover:bg-black/50"
              aria-label="Previous slide"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {index < count - 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                go(index + 1);
              }}
              className="absolute right-3 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur transition hover:bg-black/50"
              aria-label="Next slide"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-1.5 pb-3">
        {navItems.map((s, i) => {
          const n = comments.filter(
            (c) => c.slideId === s.id && !c.resolvedAt,
          ).length;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => go(i)}
              aria-label={s.label || `Slide ${i + 1}`}
              className="group relative p-1"
            >
              <span
                className={`block h-1.5 rounded-full transition-all ${
                  i === index ? "w-6 bg-white" : "w-1.5 bg-white/30 group-hover:bg-white/50"
                }`}
              />
              {n > 0 && (
                <span className="absolute -top-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-amber-400" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
