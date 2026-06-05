"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { greetingAudioSrc, type GreetingPeriod, type GreetingSlug } from "@/lib/greeting";

/** Bumping the suffix re-greets everyone (e.g. after a voice refresh). */
const SESSION_KEY = "agb_greeted_v1";

/**
 * ÑIGO voice greeting. On the first dashboard load of a browser session it
 * auto-plays "Good {period}, {nickname}" in the founder's voice clip. If the
 * browser blocks autoplay (no prior user gesture), the speaker chip pulses amber
 * as a tap-to-play affordance. The chip is always present for manual replay.
 *
 * setState only fires inside async callbacks (play promise, error/ended events,
 * click) — never synchronously in the effect body → satisfies set-state-in-effect.
 */
export function GreetingAudio({ slug, period }: { slug: GreetingSlug; period: GreetingPeriod }) {
  const src = greetingAudioSrc(slug, period);
  const ref = useRef<HTMLAudioElement | null>(null);
  const [available, setAvailable] = useState(true); // false once the clip 404s
  const [needsTap, setNeedsTap] = useState(false); // autoplay was blocked
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let greeted = false;
    try {
      greeted = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      /* sessionStorage unavailable (private mode) — just skip auto-greet */
    }
    if (greeted) return;
    const el = ref.current;
    if (!el) return;
    el
      .play()
      .then(() => {
        try {
          sessionStorage.setItem(SESSION_KEY, "1");
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        // Autoplay policy blocked it → invite a tap.
        setNeedsTap(true);
      });
  }, [src]);

  function replay() {
    const el = ref.current;
    if (!el) return;
    el.currentTime = 0;
    el
      .play()
      .then(() => {
        setNeedsTap(false);
        try {
          sessionStorage.setItem(SESSION_KEY, "1");
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        /* nothing more we can do without a gesture; the button itself is one */
      });
  }

  if (!available) return null;

  return (
    <>
      <audio
        ref={ref}
        src={src}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onEnded={() => setPlaying(false)}
        onError={() => setAvailable(false)}
      />
      <button
        type="button"
        onClick={replay}
        aria-label="Play greeting"
        title="Play greeting"
        className={`hidden h-7 w-7 shrink-0 items-center justify-center rounded-full border text-text-tertiary transition hover:text-text-primary sm:inline-flex ${
          needsTap ? "animate-pulse text-amber-text" : ""
        } ${playing ? "text-amber-text" : ""}`}
        style={{ borderColor: "var(--border-default)" }}
      >
        <Volume2 size={15} />
      </button>
    </>
  );
}
