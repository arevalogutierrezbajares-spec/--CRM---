"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Volume2 } from "lucide-react";
import { greetingAudioSrc, type GreetingPeriod, type GreetingSlug } from "@/lib/greeting";

/** Bumping the suffix re-greets everyone (e.g. after a voice refresh). */
const SESSION_KEY = "agb_greeted_v1";
const LAST_AUTO_KEY = "agb_greeted_last_auto_ms_v1";
const HOME_LEFT_KEY = "agb_home_left_ms_v1";
const HOME_RETURN_REPLAY_THROTTLE_MS = 5 * 60 * 1000;

/**
 * ÑIGO voice greeting. On the first dashboard load of a browser session it
 * auto-plays "Good {period}, {nickname}" in the founder's voice clip. If the
 * browser blocks autoplay (no prior user gesture), the speaker chip pulses amber
 * as a tap-to-play affordance. Returning to Home can replay the greeting after a
 * short throttle; the chip is always present for manual replay.
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
    if (typeof window === "undefined") return undefined;
    const markHomeLeft = () => {
      try {
        sessionStorage.setItem(HOME_LEFT_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
    };
    let greeted = false;
    let lastAutoMs = 0;
    let leftHomeMs = 0;
    try {
      greeted = sessionStorage.getItem(SESSION_KEY) === "1";
      lastAutoMs = Number(sessionStorage.getItem(LAST_AUTO_KEY) ?? "0");
      leftHomeMs = Number(sessionStorage.getItem(HOME_LEFT_KEY) ?? "0");
    } catch {
      /* sessionStorage unavailable (private mode) — just skip auto-greet */
    }
    const el = ref.current;
    if (!el) return markHomeLeft;
    const now = Date.now();
    const shouldPlayFirstGreeting = !greeted;
    const shouldReplayOnHomeReturn =
      pathname === "/" &&
      greeted &&
      leftHomeMs > 0 &&
      (lastAutoMs === 0 || now - lastAutoMs > HOME_RETURN_REPLAY_THROTTLE_MS);

    if (!shouldPlayFirstGreeting && !shouldReplayOnHomeReturn) return markHomeLeft;

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
        // Autoplay policy blocked it → invite a tap.
        setNeedsTap(true);
      });
    return markHomeLeft;
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
