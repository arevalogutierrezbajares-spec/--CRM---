"use client";

import { useEffect, useRef, useState } from "react";
import { isAudioMuted } from "@/lib/audio-mute";

/** sessionStorage flag set at successful sign-in (see app/login/caney-landing).
 *  One-shot: consumed on the first Home load after login. */
export const WIN_FLAG_KEY = "agb_play_win";
/** Dispatched by GreetingAudio when the greeting clip finishes. */
const GREETING_ENDED = "agb:greeting-ended";
/** If the greeting never fires (muted / autoplay blocked), play anyway after this. */
const GREETING_FALLBACK_MS = 5000;

/**
 * The "WIN" audio message (from win.mov, audio only) that plays ONCE right after
 * the greeting, only on a fresh login (not refresh / home-return). Armed by the
 * `agb_play_win` flag the sign-in flow sets; waits for the greeting to end, then
 * plays /audio/win.mp3. Respects the global mute. No UI — pure audio.
 *
 * setState only fires in callbacks (rAF), never the effect body.
 */
export function WinAudio() {
  const [armed, setArmed] = useState(false);
  const ref = useRef<HTMLAudioElement | null>(null);
  const startedRef = useRef(false);

  // Arm once on mount if the login flag is set; consume it immediately.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      let flagged = false;
      try {
        flagged = sessionStorage.getItem(WIN_FLAG_KEY) === "1";
        if (flagged) sessionStorage.removeItem(WIN_FLAG_KEY);
      } catch {
        /* ignore */
      }
      if (flagged) setArmed(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Once armed, play after the greeting ends (or a fallback timer).
  useEffect(() => {
    if (!armed) return;
    let fallback = 0;
    const start = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      window.removeEventListener(GREETING_ENDED, start);
      window.clearTimeout(fallback);
      if (isAudioMuted()) return;
      const a = ref.current;
      if (a) {
        a.currentTime = 0;
        void a.play().catch(() => {});
      }
    };
    window.addEventListener(GREETING_ENDED, start);
    fallback = window.setTimeout(start, GREETING_FALLBACK_MS);
    return () => {
      window.removeEventListener(GREETING_ENDED, start);
      window.clearTimeout(fallback);
    };
  }, [armed]);

  if (!armed) return null;
  return <audio ref={ref} preload="auto" src="/audio/win.mp3" />;
}
