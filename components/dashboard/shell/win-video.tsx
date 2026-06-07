"use client";

import { useEffect, useRef, useState } from "react";
import { Play, X } from "lucide-react";
import { isAudioMuted } from "@/lib/audio-mute";

/** sessionStorage flag set at successful sign-in (see app/login/caney-landing).
 *  One-shot: consumed on the first Home load after login. */
export const WIN_FLAG_KEY = "agb_play_win";
/** Dispatched by GreetingAudio when the greeting clip finishes. */
const GREETING_ENDED = "agb:greeting-ended";
/** If the greeting never fires (muted / autoplay blocked), play anyway after this. */
const GREETING_FALLBACK_MS = 5000;

/**
 * Full-screen "WIN" hype video that plays ONCE right after the greeting, only on
 * a fresh login (not on refresh/home-return). Armed by the `agb_play_win` flag
 * the sign-in flow sets; it waits for the greeting to end, plays the clip, then
 * fades out (auto on end, or Skip). Respects the global mute. If the browser
 * blocks autoplay-with-sound, it shows a tap-to-play.
 *
 * setState only fires in callbacks (rAF / events / media promises), never the
 * effect body.
 */
export function WinVideo() {
  const [armed, setArmed] = useState(false); // login flag was present
  const [active, setActive] = useState(false); // overlay shown + playing
  const [needsTap, setNeedsTap] = useState(false); // autoplay blocked
  const [leaving, setLeaving] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
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

  // Once armed, start after the greeting ends (or a fallback timer).
  useEffect(() => {
    if (!armed) return;
    let fallback = 0;
    const start = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      window.removeEventListener(GREETING_ENDED, start);
      window.clearTimeout(fallback);
      setActive(true);
    };
    window.addEventListener(GREETING_ENDED, start);
    fallback = window.setTimeout(start, GREETING_FALLBACK_MS);
    return () => {
      window.removeEventListener(GREETING_ENDED, start);
      window.clearTimeout(fallback);
    };
  }, [armed]);

  // Play when the overlay activates; respect mute, fall back to muted/tap.
  useEffect(() => {
    if (!active) return;
    const v = videoRef.current;
    if (!v) return;
    v.muted = isAudioMuted();
    v.currentTime = 0;
    v.play().catch(() => {
      v.muted = true; // autoplay-with-sound blocked → at least show it muted
      v.play()
        .then(() => setNeedsTap(!isAudioMuted()))
        .catch(() => setNeedsTap(true));
    });
  }, [active]);

  function close() {
    setLeaving(true);
    window.setTimeout(() => setActive(false), 400);
  }
  function tapPlay() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = isAudioMuted();
    v.play()
      .then(() => setNeedsTap(false))
      .catch(() => {});
  }

  if (!active) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black"
      style={{ opacity: leaving ? 0 : 1, transition: "opacity 400ms ease" }}
    >
      <video
        ref={videoRef}
        className="max-h-full max-w-full cursor-pointer"
        playsInline
        preload="auto"
        poster="/videos/win.jpg"
        onEnded={close}
        onClick={needsTap ? tapPlay : undefined}
      >
        <source src="/videos/win.webm" type="video/webm" />
        <source src="/videos/win.mp4" type="video/mp4" />
      </video>

      {needsTap && (
        <button
          type="button"
          onClick={tapPlay}
          aria-label="Play"
          className="absolute grid h-16 w-16 place-items-center rounded-full bg-white/15 text-white backdrop-blur-sm transition hover:bg-white/25"
        >
          <Play size={26} className="translate-x-0.5" fill="currentColor" />
        </button>
      )}

      <button
        type="button"
        onClick={close}
        aria-label="Skip"
        className="absolute right-5 top-5 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/[0.06] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.25em] text-white/70 backdrop-blur-sm transition hover:border-white/40 hover:text-white"
      >
        Skip <X size={13} />
      </button>
    </div>
  );
}
