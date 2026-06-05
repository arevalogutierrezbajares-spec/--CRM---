"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Volume2 } from "lucide-react";
import { greetingAudioSrc, type GreetingPeriod, type GreetingSlug } from "@/lib/greeting";

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
 * later Home load — returning to "/" or refreshing the page. If the browser
 * blocks autoplay (no prior user gesture), the speaker chip pulses amber as a
 * tap-to-play affordance; the chip is always present for manual replay.
 *
 * setState only fires inside async callbacks (play promise, error/ended events,
 * click) — never synchronously in the effect body → satisfies set-state-in-effect.
 */
export function GreetingAudio({ slug, period }: { slug: GreetingSlug; period: GreetingPeriod }) {
  const src = greetingAudioSrc(slug, period);
  const pathname = usePathname();
  const ref = useRef<HTMLAudioElement | null>(null);
  const [available, setAvailable] = useState(true); // false once the clip 404s
  const [needsTap, setNeedsTap] = useState(false); // autoplay was blocked
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
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
    // Greet on the first dashboard load of the session, and again on every later
    // Home load — returning to "/" or refreshing. Static clips are free, so the
    // only gate is the short anti-double-fire throttle.
    const shouldPlayFirstGreeting = !greeted;
    const shouldReplayOnHome = pathname === "/" && greeted && sinceLastAuto > HOME_REGREET_THROTTLE_MS;

    if (!shouldPlayFirstGreeting && !shouldReplayOnHome) return;

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
  }, [pathname, src]);

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
        src={src}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onEnded={() => setPlaying(false)}
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
        <Volume2 size={15} />
      </button>
    </>
  );
}
