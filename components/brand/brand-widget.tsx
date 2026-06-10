"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BrandPillars } from "./brand-pillars";

/** Dispatching this on window plays the widget (e.g. a programmatic replay). */
export const BRAND_INTRO_REPLAY_EVENT = "agb:brand-intro-replay";
const SEEN_KEY = "agb_brand_intro_seen_v1";

// Only the name unfolds (no " Technologies" — that word would overflow the
// sidebar). It spells out, then culls down to A·G·B; the resting lockup adds
// " Technologies" back when it settles.
const FULL_NAME = "ArevaloGutierrezBrewer";
/** Indices of A, G, B inside FULL_NAME — the letters that survive the cull. */
const KEEP = new Set([0, 7, 16]);
/** These two letters squash flat (the Luxo-lamp beat) instead of popping. */
const SQUASHED = new Set([15, 19]);

/** Fixed pseudo-random death order so the erasure reads organic. */
const CULL_RANK: Record<number, number> = {
  9: 0, 3: 1, 17: 2, 12: 3, 1: 4, 14: 5, 20: 6, 5: 7, 10: 8, 18: 9,
  2: 10, 13: 11, 21: 12, 6: 13, 8: 14, 4: 15, 11: 16, 19: 17, 15: 18,
};

const SPELL_STAGGER = 0.022;
const CULL_STAGGER = 0.035;

type Phase = "idle" | "spell" | "hold" | "cull" | "settle";

const PHASE_AFTER: Record<Exclude<Phase, "idle">, { next: Phase; ms: number }> = {
  spell: { next: "hold", ms: FULL_NAME.length * SPELL_STAGGER * 1000 + 350 },
  hold: { next: "cull", ms: 360 },
  cull: { next: "settle", ms: 18 * CULL_STAGGER * 1000 + 460 },
  settle: { next: "idle", ms: 900 },
};

type LetterCtx = { i: number; keep: boolean; squash: boolean; rank: number };

const innerVariants = {
  hidden: { opacity: 0, y: 10 },
  shown: (c: LetterCtx) => ({
    opacity: 1,
    y: 0,
    transition: { delay: c.i * SPELL_STAGGER, type: "spring" as const, stiffness: 240, damping: 15 },
  }),
  culled: (c: LetterCtx) =>
    c.keep
      ? { opacity: 1, y: 0 }
      : c.squash
        ? {
            opacity: [1, 1, 0],
            scaleY: [1, 1.3, 0.04],
            scaleX: [1, 0.85, 1.5],
            transition: { delay: c.rank * CULL_STAGGER, duration: 0.4, times: [0, 0.45, 1], ease: "backIn" as const },
          }
        : {
            opacity: [1, 1, 0],
            scale: [1, 1.4, 0],
            y: [0, -8, 4],
            transition: { delay: c.rank * CULL_STAGGER, duration: 0.4, times: [0, 0.4, 1], ease: "backIn" as const },
          },
};

const outerVariants = {
  hidden: {},
  shown: {},
  culled: (c: LetterCtx) =>
    c.keep
      ? {}
      : {
          width: 0,
          transition: { delay: c.rank * CULL_STAGGER + 0.2, duration: 0.24, ease: [0.4, 0, 1, 1] as const },
        },
};

function phaseLabel(phase: Phase): "hidden" | "shown" | "culled" {
  if (phase === "spell") return "shown";
  if (phase === "hold") return "shown";
  return "culled";
}

/**
 * Animated brand lockup for the sidebar header (top-left). Tap (or a
 * BRAND_INTRO_REPLAY_EVENT) plays the choreography IN PLACE — "ArevaloGutierrez-
 * Brewer Technologies" spells out and folds down to "AGB Technologies". The
 * animated full name overlays so it can spill right over the content for the
 * brief animation without shoving the sidebar layout. `rail` = icon-only.
 */
export function BrandWidget({ rail = false }: { rail?: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [runKey, setRunKey] = useState(0);
  const reduced = useReducedMotion();
  const playing = phase !== "idle";

  const play = useCallback(() => {
    if (reduced) return;
    setRunKey((k) => k + 1);
    setPhase("spell");
  }, [reduced]);

  useEffect(() => {
    if (phase === "idle") return;
    const { next, ms } = PHASE_AFTER[phase];
    const t = setTimeout(() => setPhase(next), ms);
    return () => clearTimeout(t);
  }, [phase, runKey]);

  // Play once per browser session (inline, not a popup).
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SEEN_KEY)) return;
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      return;
    }
    if (reduced) return;
    const t = setTimeout(play, 500);
    return () => clearTimeout(t);
  }, [play, reduced]);

  useEffect(() => {
    const onReplay = () => play();
    window.addEventListener(BRAND_INTRO_REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(BRAND_INTRO_REPLAY_EVENT, onReplay);
  }, [play]);

  const letters = (
    <motion.span
      key={runKey}
      aria-label="ArevaloGutierrezBrewer"
      className="whitespace-nowrap text-[15px] leading-none tracking-tight"
      initial="hidden"
      animate={phaseLabel(phase)}
    >
      {Array.from(FULL_NAME).map((ch, i) => {
        const ctx: LetterCtx = {
          i,
          keep: KEEP.has(i),
          squash: SQUASHED.has(i),
          rank: CULL_RANK[i] ?? 0,
        };
        return (
          <motion.span key={i} aria-hidden custom={ctx} variants={outerVariants} className="inline-block overflow-visible">
            <motion.span
              custom={ctx}
              variants={innerVariants}
              className={`inline-block ${KEEP.has(i) ? "font-bold" : ""}`}
              style={{ transformOrigin: ctx.squash ? "50% 100%" : "50% 50%" }}
            >
              {ch === " " ? " " : ch}
            </motion.span>
          </motion.span>
        );
      })}
    </motion.span>
  );

  // Rail (collapsed sidebar): just the mark; tap plays, and the name spills to
  // the right over the content during the brief fold.
  if (rail) {
    return (
      <button
        type="button"
        onClick={play}
        aria-label="AGB Technologies"
        title="AGB Technologies"
        className="relative flex items-center justify-center text-text-primary transition-opacity hover:opacity-80 active:scale-[0.96]"
      >
        <BrandPillars key={runKey} size={24} play={playing} settle={phase === "settle"} className="shrink-0 text-text-primary" />
        {playing && (
          <span className="pointer-events-none absolute left-full top-1/2 z-30 ml-2 -translate-y-1/2 rounded-md bg-[var(--bg-page)] px-2 py-1 shadow-md">
            {letters}
          </span>
        )}
      </button>
    );
  }

  // Expanded sidebar header (top-left): logo + the name.
  return (
    <button
      type="button"
      onClick={play}
      aria-label="AGB Technologies — reproducir animación"
      title="AGB Technologies"
      className="flex min-w-0 items-center gap-2 text-text-primary transition-opacity hover:opacity-80 active:scale-[0.98]"
    >
      <BrandPillars key={runKey} size={24} play={playing} settle={phase === "settle"} className="shrink-0 text-text-primary" />
      <span className="relative inline-block">
        {/* Resting lockup — sets the slot width; fades out while animating. */}
        <span
          className={`whitespace-nowrap text-[15px] leading-none tracking-tight ${playing ? "opacity-0" : ""}`}
          aria-hidden={playing}
        >
          <span className="font-bold">AGB</span>&nbsp;<span className="font-medium">Technologies</span>
        </span>
        {/* Animated full name — absolute so it spills right over the content
            instead of shoving the collapse button; subtle plate for legibility. */}
        {playing && (
          <span className="pointer-events-none absolute left-0 top-1/2 z-30 -translate-y-1/2 rounded-md bg-[var(--bg-page)] pr-2 shadow-md">
            {letters}
          </span>
        )}
      </span>
    </button>
  );
}
