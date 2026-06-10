"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BrandPillars } from "./brand-pillars";

export const BRAND_INTRO_REPLAY_EVENT = "agb:brand-intro-replay";
const SEEN_KEY = "agb_brand_intro_seen_v1";

const FULL_NAME = "ArevaloGutierrezBrewer Technologies";
/** Indices of A, G, B inside FULL_NAME — the letters that survive the cull. */
const KEEP = new Set([0, 7, 16]);
/** " Technologies" (index 22 onward) also survives. */
const WORD_START = 22;
/** These two letters get squashed flat (the Luxo-lamp beat) instead of popping. */
const SQUASHED = new Set([15, 19]);

/**
 * Fixed pseudo-random order in which the doomed letters die, so the erasure
 * reads organic instead of a left-to-right wipe. Squashed letters go last.
 */
const CULL_RANK: Record<number, number> = {
  9: 0, 3: 1, 17: 2, 12: 3, 1: 4, 14: 5, 20: 6, 5: 7, 10: 8, 18: 9,
  2: 10, 13: 11, 21: 12, 6: 13, 8: 14, 4: 15, 11: 16, 19: 17, 15: 18,
};

const SPELL_STAGGER = 0.026;
const CULL_STAGGER = 0.04;

type Phase = "pillars" | "spell" | "hold" | "cull" | "settle";

const PHASE_AFTER: Record<Phase, { next: Phase | "close"; ms: number }> = {
  pillars: { next: "spell", ms: 850 },
  spell: { next: "hold", ms: FULL_NAME.length * SPELL_STAGGER * 1000 + 500 },
  hold: { next: "cull", ms: 420 },
  cull: { next: "settle", ms: 18 * CULL_STAGGER * 1000 + 520 },
  settle: { next: "close", ms: 950 },
};

type LetterCtx = { i: number; keep: boolean; squash: boolean; rank: number };

const innerVariants = {
  hidden: { opacity: 0, y: 16 },
  shown: (c: LetterCtx) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: c.i * SPELL_STAGGER,
      type: "spring" as const,
      stiffness: 220,
      damping: 14,
    },
  }),
  culled: (c: LetterCtx) =>
    c.keep
      ? { opacity: 1, y: 0 }
      : c.squash
        ? {
            // squashed flat from the bottom, like the lamp landing on the "I"
            opacity: [1, 1, 0],
            scaleY: [1, 1.3, 0.04],
            scaleX: [1, 0.85, 1.5],
            transition: {
              delay: c.rank * CULL_STAGGER,
              duration: 0.42,
              times: [0, 0.45, 1],
              ease: "backIn" as const,
            },
          }
        : {
            // anticipation pop: grow first, then burst away
            opacity: [1, 1, 0],
            scale: [1, 1.4, 0],
            y: [0, -10, 4],
            transition: {
              delay: c.rank * CULL_STAGGER,
              duration: 0.42,
              times: [0, 0.4, 1],
              ease: "backIn" as const,
            },
          },
};

const outerVariants = {
  hidden: {},
  shown: {},
  culled: (c: LetterCtx) =>
    c.keep
      ? {}
      : {
          // collapsing width is what slides the survivors together
          width: 0,
          transition: {
            delay: c.rank * CULL_STAGGER + 0.22,
            duration: 0.26,
            ease: [0.4, 0, 1, 1] as const,
          },
        },
};

function phaseLabel(phase: Phase): "hidden" | "shown" | "culled" {
  if (phase === "pillars") return "hidden";
  if (phase === "spell" || phase === "hold") return "shown";
  return "culled";
}

/**
 * Pixar-style brand intro overlay. Plays once per session on load and replays
 * whenever a BRAND_INTRO_REPLAY_EVENT is dispatched (the sidebar logo does
 * this). Click anywhere or press Escape to skip. Honors reduced motion by
 * showing a simple fade of the final lockup instead of the choreography.
 */
export function BrandIntro() {
  const [run, setRun] = useState(0); // each run remounts the scene fresh
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("pillars");
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const start = useCallback(() => {
    setPhase("pillars");
    setRun((r) => r + 1);
    setOpen(true);
  }, []);

  // Auto-play once per browser session.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SEEN_KEY)) return;
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    if (reducedRef.current) return;
    const t = setTimeout(start, 150);
    return () => clearTimeout(t);
  }, [start]);

  // Replay on demand (sidebar logo click).
  useEffect(() => {
    const onReplay = () => start();
    window.addEventListener(BRAND_INTRO_REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(BRAND_INTRO_REPLAY_EVENT, onReplay);
  }, [start]);

  // Phase timeline.
  useEffect(() => {
    if (!open) return;
    if (reduced) {
      const t = setTimeout(() => setOpen(false), 1400);
      return () => clearTimeout(t);
    }
    const { next, ms } = PHASE_AFTER[phase];
    const t = setTimeout(() => {
      if (next === "close") setOpen(false);
      else setPhase(next);
    }, ms);
    return () => clearTimeout(t);
  }, [open, phase, reduced, run]);

  // Escape to skip.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key={run}
          role="presentation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[400] flex cursor-pointer flex-col items-center justify-center gap-10 bg-[var(--bg-page)] px-6 text-[var(--text-primary)]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.02, transition: { duration: 0.4, ease: "easeOut" } }}
        >
          {reduced ? (
            <motion.div
              className="flex flex-col items-center gap-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <BrandPillars size={110} play={false} />
              <div className="text-4xl font-semibold tracking-tight">
                AGB&nbsp;Technologies
              </div>
            </motion.div>
          ) : (
            <>
              <BrandPillars size={110} settle={phase === "settle"} />
              <motion.div
                animate={phase === "settle" ? { scale: 1.42 } : { scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 22 }}
              >
                <motion.div
                  aria-label="AGB Technologies"
                  className="whitespace-nowrap text-[clamp(18px,4vw,42px)] font-semibold tracking-tight"
                  initial="hidden"
                  animate={phaseLabel(phase)}
                >
                  {Array.from(FULL_NAME).map((ch, i) => {
                    const ctx: LetterCtx = {
                      i,
                      keep: KEEP.has(i) || i >= WORD_START,
                      squash: SQUASHED.has(i),
                      rank: CULL_RANK[i] ?? 0,
                    };
                    return (
                      <motion.span
                        key={i}
                        aria-hidden
                        custom={ctx}
                        variants={outerVariants}
                        className="inline-block overflow-visible"
                      >
                        <motion.span
                          custom={ctx}
                          variants={innerVariants}
                          className="inline-block"
                          style={{
                            transformOrigin: ctx.squash ? "50% 100%" : "50% 50%",
                          }}
                        >
                          {ch === " " ? " " : ch}
                        </motion.span>
                      </motion.span>
                    );
                  })}
                </motion.div>
              </motion.div>
              <motion.div
                className="font-mono text-[11px] tracking-[0.2em] text-[var(--text-tertiary)] uppercase"
                initial={{ opacity: 0 }}
                animate={{ opacity: phase === "settle" ? 0 : 0.8 }}
                transition={{ delay: 1.2, duration: 0.6 }}
              >
                click to skip
              </motion.div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
