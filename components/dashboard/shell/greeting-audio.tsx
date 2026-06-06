"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AudioLines } from "lucide-react";
import { greetingAudioSrc, type GreetingPeriod, type GreetingSlug } from "@/lib/greeting";
import { isAudioMuted, onAudioMuteChange } from "@/lib/audio-mute";

/** Bumping the suffix re-greets everyone (e.g. after a voice refresh). */
const SESSION_KEY = "agb_greeted_v1";
const LAST_AUTO_KEY = "agb_greeted_last_auto_ms_v1";
// The clips are pre-rendered static files (no ElevenLabs at runtime), so we
// re-greet freely on every Home load. This throttle is only an anti-double-fire
// guard (React's dev double-mount + refresh-spam), NOT an annoyance limiter.
const HOME_REGREET_THROTTLE_MS = 5_000;

/**
 * ÑIGO voice greeting. Auto-plays "Good {period}, {nickname}" from a pre-rendered
 * static clip on the first dashboard load of a browser session, and again on any
 * later Home load (returning to "/" or refreshing). The *first* greeting of a
 * session uses `firstSlug` when provided (e.g. "Sir TIGR"); later re-greets swap
 * to `slug` (e.g. "Master Top G"). Respects the global mute. If the browser
 * blocks autoplay, the speaker chip pulses amber as a tap-to-play affordance.
 *
 * setState only fires inside async callbacks (play promise, error/ended events,
 * click, mute event) — never synchronously in the effect body.
 */
export function GreetingAudio({
  slug,
  firstSlug,
  period,
}: {
  slug: GreetingSlug;
  firstSlug?: GreetingSlug;
  period: GreetingPeriod;
}) {
  const swapSrc = greetingAudioSrc(slug, period);
  const firstSrc = greetingAudioSrc(firstSlug ?? slug, period);
  const pathname = usePathname();
  const ref = useRef<HTMLAudioElement | null>(null);
  const [available, setAvailable] = useState(true); // false once the clip 404s
  const [needsTap, setNeedsTap] = useState(false); // autoplay was blocked
  const [playing, setPlaying] = useState(false);

  // Stop immediately if the user mutes mid-greeting.
  useEffect(
    () =>
      onAudioMuteChange((muted) => {
        if (!muted) return;
        const el = ref.current;
        if (el) {
          el.pause();
          el.currentTime = 0;
        }
      }),
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isAudioMuted()) return; // global mute → no auto-greet
    let greeted = false;
    let lastAutoMs = 0;
    try {
      greeted = sessionStorage.getItem(SESSION_KEY) === "1";
      lastAutoMs = Number(sessionStorage.getItem(LAST_AUTO_KEY) ?? "0");
    } catch {
      /* sessionStorage unavailable (private mode) — just skip auto-greet */
    }
    const el = ref.current;
    if (!el) return;
    const now = Date.now();
    const sinceLastAuto = lastAutoMs > 0 ? now - lastAutoMs : Infinity;
    const shouldPlayFirstGreeting = !greeted;
    const shouldReplayOnHome = pathname === "/" && greeted && sinceLastAuto > HOME_REGREET_THROTTLE_MS;

    if (!shouldPlayFirstGreeting && !shouldReplayOnHome) return;

    // First greeting of the session → "Sir TIGR"; every later one → "Master Top G".
    el.src = shouldPlayFirstGreeting ? firstSrc : swapSrc;
    el.currentTime = 0;
    el
      .play()
      .then(() => {
        try {
          sessionStorage.setItem(SESSION_KEY, "1");
          sessionStorage.setItem(LAST_AUTO_KEY, String(Date.now()));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        // Autoplay policy blocked it → invite a tap (amber pulse).
        setNeedsTap(true);
      });
  }, [pathname, firstSrc, swapSrc]);

  function replay() {
    if (isAudioMuted()) return; // muted → the mute toggle is the master switch
    const el = ref.current;
    if (!el) return;
    // Manual replay uses whatever was last loaded, defaulting to the swap voice.
    if (!el.currentSrc) el.src = swapSrc;
    el.currentTime = 0;
    el
      .play()
      .then(() => {
        setNeedsTap(false);
        try {
          sessionStorage.setItem(SESSION_KEY, "1");
          sessionStorage.setItem(LAST_AUTO_KEY, String(Date.now()));
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
        preload="auto"
        onPlay={() => setPlaying(true)}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onError={() => setAvailable(false)}
      />
      <button
        type="button"
        onClick={replay}
        aria-label="Play ÑIGO greeting"
        title="Play ÑIGO greeting"
        className={`hidden h-7 w-7 shrink-0 items-center justify-center rounded-full border text-text-tertiary transition hover:text-text-primary sm:inline-flex ${
          needsTap ? "animate-pulse text-amber-text" : ""
        } ${playing ? "text-amber-text" : ""}`}
        style={{ borderColor: "var(--border-default)" }}
      >
        <AudioLines size={15} />
      </button>
    </>
  );
}
