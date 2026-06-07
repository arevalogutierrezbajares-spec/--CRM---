"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isAudioMuted } from "@/lib/audio-mute";

// ─── Post-sign-in loading interstitial ──────────────────────────────────────
// Plays after a successful sign-in while the CRM loads. The "Man in the Arena"
// passage types out over the B&W expedition photo with a Free Bird solo playing
// behind it; the attribution fades in, then we auto-advance into the app (which
// then greets + plays the WIN audio). Skip (top-right or Esc) jumps straight in.
//
// Timing is time-bounded, not per-character: the whole passage always finishes
// in TYPE_MS regardless of its length, so the screen never runs long. Sentence
// punctuation carries extra weight so the caret breathes at the right moments
// instead of marching at a flat rate.

const QUOTE =
  "It is not the critic who counts; not the man who points out how the strong man stumbles, or where the doer of deeds could have done them better. The credit belongs to the man who is actually in the arena, whose face is marred by dust and sweat and blood; who strives valiantly; who errs, who comes short again and again, because there is no effort without error and shortcoming; but who does actually strive to do the deeds; who knows great enthusiasms, the great devotions; who spends himself in a worthy cause; who at the best knows in the end the triumph of high achievement, and who at the worst, if he fails, at least fails while daring greatly, so that his place shall never be with those cold and timid souls who neither know victory nor defeat.";

const IMAGE_SRC = "/caney.png";

const TYPE_MS = 30_000; // total time to type the whole passage (~25 chars/sec, readable)
const HOLD_MS = 2_000; // dwell after the passage completes, then advance

// Extra dwell weight applied to the character *before* a natural pause, so the
// caret lingers after commas, semicolons, and full stops.
function pauseWeight(ch: string): number {
  if (ch === ".") return 9;
  if (ch === ";") return 6;
  if (ch === ",") return 4;
  if (ch === " ") return 1.15;
  return 1;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function ArenaLoader({ next }: { next: string }) {
  // With reduced motion we show the full passage immediately, so seed state
  // from the preference rather than mutating it inside an effect.
  const [count, setCount] = useState(() =>
    prefersReducedMotion() ? QUOTE.length : 0,
  );
  const [done, setDone] = useState(() => prefersReducedMotion());
  const [leaving, setLeaving] = useState(false);
  const navigatedRef = useRef(false);
  const songRef = useRef<HTMLAudioElement | null>(null);

  // Background song (Free Bird solo) while the poem is on screen — this is the
  // same document as the sign-in click, so autoplay is allowed. Respects mute.
  useEffect(() => {
    if (isAudioMuted()) return;
    const a = songRef.current;
    if (a) {
      a.volume = 0.55;
      void a.play().catch(() => {});
    }
  }, []);


  // Per-character completion times: char i becomes visible at deadlines[i] (ms).
  const deadlines = useMemo(() => {
    const weights = Array.from(QUOTE, pauseWeight);
    const total = weights.reduce((a, b) => a + b, 0);
    let acc = 0;
    return weights.map((w) => {
      acc += w;
      return (acc / total) * TYPE_MS;
    });
  }, []);

  const enter = useMemo(
    () => () => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      setLeaving(true);
      // fade the song down as we leave (songRef is a ref → no dep needed)
      const a = songRef.current;
      if (a) {
        const step = (a.volume || 0.55) / 8;
        const id = window.setInterval(() => {
          a.volume = Math.max(0, a.volume - step);
          if (a.volume <= 0.02) {
            a.pause();
            window.clearInterval(id);
          }
        }, 45);
      }
      // let the fade-to-black play, then hand off to the CRM
      window.setTimeout(() => {
        window.location.href = next;
      }, 420);
    },
    [next],
  );

  // Type the passage on a rAF clock; respect reduced-motion by revealing it all.
  useEffect(() => {
    if (prefersReducedMotion()) {
      const t = window.setTimeout(enter, HOLD_MS + 500);
      return () => window.clearTimeout(t);
    }

    let raf = 0;
    let start = 0;
    let holdTimer = 0;

    const tick = (now: number) => {
      if (!start) start = now;
      const elapsed = now - start;
      let i = count;
      while (i < deadlines.length && deadlines[i] <= elapsed) i++;
      if (i !== count) setCount(i);
      if (elapsed >= TYPE_MS) {
        setCount(QUOTE.length);
        setDone(true);
        holdTimer = window.setTimeout(enter, HOLD_MS);
        return;
      }
      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(holdTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlines, enter]);

  // Esc skips.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") enter();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enter]);

  const shown = QUOTE.slice(0, count);

  return (
    <div
      className="fixed inset-0 z-[100] overflow-hidden bg-[#0a0c10] text-[#F0EEE8]"
      style={{
        opacity: leaving ? 0 : 1,
        transition: "opacity 420ms cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      {/* Background song while the poem is on screen (Free Bird solo). */}
      <audio ref={songRef} preload="auto" src="/audio/arena-intro.mp3" />

      {/* Photo backdrop with a slow push-in (transform only — never layout) */}
      <div
        className="absolute inset-0 bg-cover bg-center [animation:arena-kenburns_34s_cubic-bezier(0.16,1,0.3,1)_forwards] motion-reduce:animate-none"
        style={{
          backgroundImage: `url(${IMAGE_SRC}), linear-gradient(135deg,#0a0e14,#1a1410)`,
          filter: "grayscale(0.25) brightness(0.5) contrast(1.05)",
        }}
      />
      {/* Cinematic darkening so the text always reads */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,10,14,0.55)_0%,rgba(8,10,14,0.82)_55%,rgba(8,10,14,0.92)_100%)]" />
      {/* Vignette + faint grain */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.65)_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.5] mix-blend-overlay [background-image:repeating-linear-gradient(0deg,rgba(255,255,255,0.02)_0,rgba(255,255,255,0.02)_1px,transparent_1px,transparent_3px)]" />

      {/* Skip — top right. z-30 keeps it above the full-screen quote layer
          (which is z-10 and paints later in the DOM), so the click always lands. */}
      <button
        type="button"
        onClick={enter}
        className="absolute right-5 top-5 z-30 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.3em] text-white/55 backdrop-blur-sm transition-colors duration-200 hover:border-white/30 hover:text-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24B]/60"
        aria-label="Skip the intro and enter the workspace"
      >
        Skip <span aria-hidden className="ml-1">&#9656;</span>
      </button>

      {/* Brand mark — faint, top left, for continuity with the sign-in screen */}
      <div className="pointer-events-none absolute left-6 top-6 z-10 font-mono text-[10px] uppercase tracking-[0.5em]">
        <span className="text-[#C9A24B]/80">X</span>
        <span className="text-white/25"> . </span>
        <span className="text-white/55">JEAV</span>
        <span className="text-white/25"> . </span>
        <span className="text-[#C9A24B]/40">TIGR</span>
      </div>

      {/* Quote — purely decorative (aria-hidden text + sr-only copy), so it must
          not eat pointer events; otherwise this full-screen layer would cover
          the Skip button. */}
      <div className="pointer-events-none relative z-10 flex h-full w-full items-center justify-center px-6">
        <figure className="w-[min(72ch,92vw)]">
          {/* Animated, typed copy — hidden from AT (full text provided below) */}
          <blockquote
            aria-hidden
            className="font-mono text-[15px] leading-[2.05] tracking-[0.01em] text-[#EDEAE2] [text-shadow:0_1px_24px_rgba(0,0,0,0.6)] sm:text-[17px] sm:leading-[2.1]"
          >
            {shown}
            <span
              className="ml-[1px] inline-block w-[0.55ch] -translate-y-[0.06em] align-baseline bg-[#C9A24B]"
              style={{
                height: "1.05em",
                // The blink is a CSS animation; it must be removed (not just
                // dimmed) once typing is done, or it overrides the fade-out.
                animation: done ? "none" : "arena-caret 1s step-end infinite",
                opacity: done ? 0 : 1,
                transition: "opacity 600ms ease-out",
              }}
            />
          </blockquote>

          {/* Attribution — fades up once the passage lands */}
          <figcaption
            className="mt-8 font-mono text-[11px] uppercase tracking-[0.32em] text-white/45"
            style={{
              opacity: done ? 1 : 0,
              transform: done ? "translateY(0)" : "translateY(8px)",
              transition:
                "opacity 900ms cubic-bezier(0.16,1,0.3,1), transform 900ms cubic-bezier(0.16,1,0.3,1)",
            }}
          >
            <span className="text-[#C9A24B]/70">&#8212;</span> Theodore Roosevelt
            <span className="mt-1 block text-[10px] tracking-[0.28em] text-white/30">
              The Man in the Arena &middot; 1910
            </span>
          </figcaption>

          {/* Accessible, non-animated copy of the full passage */}
          <span className="sr-only">
            {QUOTE} — Theodore Roosevelt, The Man in the Arena, 1910. Loading
            your workspace.
          </span>
        </figure>
      </div>

      <style jsx global>{`
        @keyframes arena-caret {
          0%,
          50% {
            opacity: 1;
          }
          50.01%,
          100% {
            opacity: 0;
          }
        }
        @keyframes arena-kenburns {
          from {
            transform: scale(1.02);
          }
          to {
            transform: scale(1.1);
          }
        }
      `}</style>
    </div>
  );
}
