"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Lock,
  MessageSquare,
  Send,
  X,
} from "lucide-react";
import { useState, useTransition } from "react";
import type {
  PitchFeedbackPersonalization,
  PitchFeedbackSection,
} from "@/lib/pitch-feedback/types";

type InitialResponse = {
  sectionKey: string;
  promptKey: string;
  responseType: string;
  value: Record<string, unknown>;
};

const REACTIONS = ["clear", "exciting", "useful", "confused", "skeptical", "want more"];

export function PitchFeedbackPlayer({
  token,
  sessionId,
  campaign,
  contact,
  invite,
  sections,
  initialResponses,
}: {
  token: string;
  sessionId: string;
  campaign: {
    id: string;
    name: string;
    description: string | null;
    audience: string;
  };
  contact: {
    id: string;
    name: string;
    organization: string | null;
  };
  invite: {
    id: string;
    status: string;
    completionPercent: number;
    currentSectionKey: string | null;
    personalization: PitchFeedbackPersonalization;
  };
  sections: PitchFeedbackSection[];
  initialResponses: InitialResponse[];
}) {
  const count = sections.length;

  const initialIndex = (() => {
    if (invite.status === "completed") return count;
    if (!invite.currentSectionKey) return 0;
    const found = sections.findIndex((s) => s.key === invite.currentSectionKey);
    return found >= 0 ? found : 0;
  })();

  // notes keyed by "<sectionKey>_note" and "final_thoughts"
  const [notes, setNotes] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const r of initialResponses) {
      if (r.responseType === "text" && typeof r.value.text === "string") {
        init[r.promptKey] = r.value.text;
      }
    }
    return init;
  });

  const [finalReaction, setFinalReaction] = useState(() => {
    const r = initialResponses.find((r) => r.promptKey === "final_reaction");
    return typeof r?.value.reaction === "string" ? r.value.reaction : "";
  });

  const [index, setIndex] = useState(initialIndex);
  const [noteOpen, setNoteOpen] = useState(false);
  const [completed, setCompleted] = useState(invite.status === "completed");
  const [saving, startTransition] = useTransition();

  const isWrapUp = index === count;
  const section = sections[index] ?? null;

  function noteKeyFor(sectionKey: string) {
    return `${sectionKey}_note`;
  }

  function currentNote() {
    return section ? (notes[noteKeyFor(section.key)] ?? "") : "";
  }

  function setCurrentNote(text: string) {
    if (!section) return;
    setNotes((n) => ({ ...n, [noteKeyFor(section.key)]: text }));
  }

  async function persistNote(fromIndex: number, toIndex: number) {
    const sec = sections[fromIndex];
    if (!sec) return;
    const note = notes[noteKeyFor(sec.key)] ?? "";
    const responses = note.trim()
      ? [
          {
            promptKey: noteKeyFor(sec.key),
            responseType: "text" as const,
            value: { text: note.trim() },
          },
        ]
      : [];
    const nextSec = toIndex < count ? sections[toIndex] : null;
    const progressPercent = Math.round(
      ((Math.min(toIndex, count - 1) + 1) / count) * 100,
    );
    await fetch("/api/pitch-feedback/respond", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        sessionId,
        sectionKey: sec.key,
        currentSectionKey: nextSec?.key ?? "wrap_up",
        progressPercent,
        responses,
        completed: false,
      }),
    });
  }

  function navigate(nextIndex: number) {
    const target = Math.max(0, Math.min(count, nextIndex));
    if (section) {
      startTransition(async () => {
        await persistNote(index, target);
      });
    }
    setIndex(target);
    setNoteOpen(false);
  }

  function submitWrapUp() {
    const responses: {
      promptKey: string;
      responseType: string;
      value: Record<string, unknown>;
    }[] = [];
    if (finalReaction) {
      responses.push({
        promptKey: "final_reaction",
        responseType: "reaction",
        value: { reaction: finalReaction },
      });
    }
    const thoughts = (notes["final_thoughts"] ?? "").trim();
    if (thoughts) {
      responses.push({
        promptKey: "final_thoughts",
        responseType: "text",
        value: { text: thoughts },
      });
    }
    startTransition(async () => {
      const lastSec = sections[count - 1];
      await fetch("/api/pitch-feedback/respond", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          sessionId,
          sectionKey: "wrap_up",
          currentSectionKey: lastSec?.key ?? "wrap_up",
          progressPercent: 100,
          responses,
          completed: true,
        }),
      });
      setCompleted(true);
    });
  }

  if (!count) {
    return (
      <main className="grid min-h-screen place-items-center bg-neutral-950 p-5">
        <div className="max-w-md rounded-xl border border-white/10 bg-white/5 p-6 text-center">
          <h1 className="text-xl font-semibold text-white">Nothing to review yet</h1>
          <p className="mt-2 text-sm text-white/50">
            The sender has not published any sections for this private review.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-neutral-950 text-white">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 text-xs text-white/50">
            <Lock className="h-3 w-3" />
            Private
          </span>
          <span className="text-xs tabular-nums text-white/30">
            {isWrapUp ? "Wrap up" : `${index + 1} / ${count}`}
          </span>
        </div>
        <span className="min-w-0 truncate text-xs text-white/40">{campaign.name}</span>
        {!isWrapUp && !completed && (
          <button
            type="button"
            onClick={() => setNoteOpen((v) => !v)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              noteOpen
                ? "bg-white text-black"
                : "bg-white/10 text-white/70 hover:bg-white/20"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {currentNote().trim() ? "Edit note" : "Add note"}
          </button>
        )}
      </div>

      {/* Section content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {completed ? (
            <motion.div
              key="complete"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 items-center justify-center p-6"
            >
              <div className="max-w-md text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white text-black">
                  <Check className="h-6 w-6" />
                </div>
                <h2 className="mt-5 text-3xl font-semibold tracking-tight">
                  Feedback received
                </h2>
                <p className="mt-3 text-sm leading-6 text-white/50">
                  Thanks for taking the time. Your comments were saved to the private review.
                </p>
              </div>
            </motion.div>
          ) : isWrapUp ? (
            <motion.div
              key="wrapup"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ type: "spring", duration: 0.3, bounce: 0 }}
              className="flex flex-1 flex-col overflow-y-auto px-4 py-8"
            >
              <div className="mx-auto w-full max-w-lg space-y-7">
                <div>
                  <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    Any final thoughts?
                  </h2>
                  <p className="mt-2 text-sm text-white/50">
                    Both fields are optional — hit Submit whenever you&rsquo;re ready.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-widest text-white/30">
                    Overall reaction
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {REACTIONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setFinalReaction((v) => (v === r ? "" : r))}
                        className={`rounded-lg px-3 py-2 text-sm transition ${
                          finalReaction === r
                            ? "bg-white font-medium text-black"
                            : "bg-white/10 text-white/70 hover:bg-white/20"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="final-thoughts"
                    className="text-xs font-medium uppercase tracking-widest text-white/30"
                  >
                    Final thoughts
                  </label>
                  <textarea
                    id="final-thoughts"
                    value={notes["final_thoughts"] ?? ""}
                    onChange={(e) =>
                      setNotes((n) => ({ ...n, final_thoughts: e.target.value }))
                    }
                    rows={4}
                    placeholder="What should I clarify, keep, or change?"
                    className="w-full resize-none rounded-lg bg-white/10 px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:bg-white/15 focus:ring-1 focus:ring-white/20"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => navigate(count - 1)}
                    className="flex items-center gap-1.5 text-sm text-white/40 transition hover:text-white"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={submitWrapUp}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black transition disabled:opacity-50 hover:bg-white/90"
                  >
                    <Send className="h-4 w-4" />
                    Submit
                  </button>
                </div>
              </div>
            </motion.div>
          ) : section ? (
            <motion.div
              key={section.key}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ type: "spring", duration: 0.3, bounce: 0 }}
              className="flex flex-1 flex-col overflow-y-auto px-4 py-8"
            >
              <div className="mx-auto w-full max-w-2xl space-y-5">
                {index === 0 && invite.personalization?.welcomeNote && (
                  <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white/70">
                    {invite.personalization.welcomeNote}
                  </div>
                )}
                {section.eyebrow && (
                  <div className="text-xs font-medium uppercase tracking-widest text-white/30">
                    {section.eyebrow}
                  </div>
                )}
                <h2 className="text-3xl font-semibold leading-snug tracking-tight sm:text-4xl">
                  {section.title}
                </h2>
                <p className="text-base leading-7 text-white/65 sm:text-lg">
                  {section.body}
                </p>
                {section.proof && (
                  <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white/55">
                    {section.proof}
                  </div>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Note drawer */}
        <AnimatePresence>
          {noteOpen && section && !isWrapUp && (
            <motion.div
              key="note-drawer"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ type: "spring", duration: 0.22, bounce: 0 }}
              className="shrink-0 border-t border-white/10 bg-neutral-900 px-4 py-3"
            >
              <div className="mx-auto flex max-w-2xl items-start gap-3">
                <textarea
                  autoFocus
                  value={currentNote()}
                  onChange={(e) => setCurrentNote(e.target.value)}
                  rows={3}
                  placeholder={`Note on "${section.title}"…`}
                  className="flex-1 resize-none rounded-lg bg-white/10 px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:bg-white/15"
                />
                <button
                  type="button"
                  onClick={() => setNoteOpen(false)}
                  className="mt-1 text-white/30 transition hover:text-white"
                  aria-label="Close note"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom nav */}
      {!completed && (
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-4 pt-1">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => navigate(index - 1)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20 disabled:opacity-25"
            aria-label="Previous"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {/* Section dots + wrap-up dot */}
          <div className="flex items-center gap-1.5">
            {sections.map((s, i) => {
              const hasNote = (notes[noteKeyFor(s.key)] ?? "").trim().length > 0;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => navigate(i)}
                  aria-label={`Section ${i + 1}`}
                  className="group relative p-1"
                >
                  <span
                    className={`block h-1.5 rounded-full transition-all ${
                      i === index ? "w-6 bg-white" : "w-1.5 bg-white/25 group-hover:bg-white/50"
                    }`}
                  />
                  {hasNote && (
                    <span className="absolute -top-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-amber-400" />
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => navigate(count)}
              aria-label="Wrap up"
              className="group p-1"
            >
              <span
                className={`block h-1.5 rounded-full transition-all ${
                  isWrapUp ? "w-6 bg-white" : "w-1.5 bg-white/25 group-hover:bg-white/50"
                }`}
              />
            </button>
          </div>

          {!isWrapUp ? (
            <button
              type="button"
              onClick={() => navigate(index + 1)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
              aria-label="Next"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          ) : (
            <div className="h-9 w-9" />
          )}
        </div>
      )}
    </main>
  );
}
