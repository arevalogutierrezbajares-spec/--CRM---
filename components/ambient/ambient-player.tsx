"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Music2, Pause, Play, RotateCcw, SkipForward, Volume2, VolumeX } from "lucide-react";
import { isAudioMuted, onAudioMuteChange } from "@/lib/audio-mute";

/**
 * Ambient motivation player — background audio across the whole app.
 *
 * Two modes:
 *  - FIRST RUN (this browser has never heard the intro): plays the one fixed
 *    Motiversity video start-to-finish. When it ends — or on the next session —
 *    it switches to random mode forever.
 *  - RANDOM: shuffles the Motiversity channel's uploads playlist (no API key —
 *    a channel's uploads playlist id is its channel id with UC -> UU), starting
 *    at a random index so each session differs, and auto-advances.
 *
 * The YouTube iframe is parked off-screen (audio only). A small music icon sits
 * bottom-right; hovering it slides up a control bar (restart / play / skip + vol).
 *
 * On a FRESH login, after the ÑIGO greeting ends (`agb:greeting-ended`), the
 * screen blurs for a beat and then playback begins. Armed by the one-shot
 * `agb_play_ambient` flag the sign-in flow sets. Respects the global mute.
 */

// The fixed intro track — youtube.com/watch?v=r04ZPcYyTjw
const VIDEO_ID = "r04ZPcYyTjw";
// Motiversity channel UCAPByrKU5-R1emswVlyH_-g -> uploads playlist (UC -> UU).
const UPLOADS_PLAYLIST = "UUAPByrKU5-R1emswVlyH_-g";
// Embedded playlists surface up to ~200 items; randomise the entry point within.
const RANDOM_INDEX_RANGE = 200;

const LS_VOLUME = "agb.ambient.volume";
// Persists across sessions (per browser): set once the intro has been heard.
const FIRST_DONE_KEY = "agb_ambient_first_done_v1";
const LOGIN_FLAG = "agb_play_ambient";
const GREETING_ENDED = "agb:greeting-ended";
// If the greeting never fires (muted / autoplay blocked), start anyway after this.
const GREETING_FALLBACK_MS = 6000;

const YT_PLAYING = 1;

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  nextVideo: () => void;
  setShuffle: (on: boolean) => void;
  loadPlaylist: (opts: { list: string; listType: string; index?: number }) => void;
  mute: () => void;
  unMute: () => void;
  setVolume: (v: number) => void;
  getPlayerState: () => number;
};

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement, opts: unknown) => YTPlayer;
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) return resolve();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return apiPromise;
}

function markFirstDone() {
  try {
    localStorage.setItem(FIRST_DONE_KEY, "1");
  } catch {
    /* ignore */
  }
}

type Phase = "idle" | "blurring" | "revealed";

export function AmbientPlayer() {
  const holderRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const startedRef = useRef(false); // guards the one-shot login start sequence
  const modeRef = useRef<"first" | "random">("random");
  const goRandomRef = useRef<() => void>(() => {});

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(40);
  const [phase, setPhase] = useState<Phase>("idle"); // blur-overlay state machine

  // Restore saved volume.
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(LS_VOLUME));
      if (Number.isFinite(v) && v > 0) setVolume(v);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(LS_VOLUME, String(volume));
    } catch {
      /* ignore */
    }
  }, [volume]);

  // Switch to shuffled-channel mode (used when the intro ends or on skip).
  goRandomRef.current = () => {
    const p = playerRef.current;
    if (!p) return;
    modeRef.current = "random";
    markFirstDone();
    const index = Math.floor(Math.random() * RANDOM_INDEX_RANGE);
    p.loadPlaylist({ list: UPLOADS_PLAYLIST, listType: "playlist", index });
    p.setShuffle(true);
  };

  // Create the hidden player once, in whichever mode this browser is owed.
  useEffect(() => {
    let cancelled = false;
    let firstDone = false;
    try {
      firstDone = localStorage.getItem(FIRST_DONE_KEY) === "1";
    } catch {
      /* ignore */
    }
    modeRef.current = firstDone ? "random" : "first";
    const startIndex = Math.floor(Math.random() * RANDOM_INDEX_RANGE);

    const common = { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, modestbranding: 1 };
    const playerVars = firstDone
      ? { ...common, listType: "playlist", list: UPLOADS_PLAYLIST, index: startIndex, loop: 1 }
      : { ...common, loop: 0 }; // intro plays once, then flows into random

    loadYouTubeApi().then(() => {
      if (cancelled || !holderRef.current || playerRef.current) return;
      playerRef.current = new window.YT!.Player(holderRef.current, {
        height: "1",
        width: "1",
        ...(firstDone ? {} : { videoId: VIDEO_ID }),
        playerVars,
        events: {
          onReady: (e: { target: YTPlayer }) => {
            if (modeRef.current === "random") e.target.setShuffle(true);
            setReady(true);
          },
          onStateChange: (e: { data: number }) => {
            const S = window.YT?.PlayerState;
            if (e.data === S?.PLAYING) {
              setPlaying(true);
              if (modeRef.current === "first") markFirstDone(); // partial listens still count
            } else if (e.data === S?.PAUSED) {
              setPlaying(false);
            } else if (e.data === S?.ENDED) {
              if (modeRef.current === "first") goRandomRef.current(); // intro done -> random
            }
          },
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep YouTube volume/mute in sync with our UI + the global mute.
  useEffect(() => {
    if (!ready) return;
    const p = playerRef.current;
    if (!p) return;
    if (muted) p.mute();
    else {
      p.unMute();
      p.setVolume(volume);
    }
  }, [volume, muted, ready]);

  // Mirror the app-wide mute toggle.
  useEffect(() => onAudioMuteChange((m) => setMuted(m)), []);

  // Start playback with sound, falling back to muted autoplay + unmute-on-gesture
  // if the browser's autoplay policy blocks unmuted start.
  const beginPlayback = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (isAudioMuted()) {
      setMuted(true);
      p.mute();
    } else {
      p.unMute();
      p.setVolume(volume);
    }
    p.playVideo();
    window.setTimeout(() => {
      const pl = playerRef.current;
      if (!pl) return;
      if (pl.getPlayerState() !== YT_PLAYING) {
        // Unmuted autoplay was blocked → muted autoplay (always allowed)…
        pl.mute();
        pl.playVideo();
        if (!isAudioMuted()) {
          // …then unmute on the very first user interaction.
          const unmute = () => {
            pl.unMute();
            pl.setVolume(volume);
            setMuted(false);
          };
          window.addEventListener("pointerdown", unmute, { once: true });
          window.addEventListener("keydown", unmute, { once: true });
        }
      }
    }, 900);
  }, [volume]);

  // The cinematic: blur the screen, then start. Returns immediately.
  const runIntro = useCallback(() => {
    setPhase("blurring"); // overlay fades in
    window.setTimeout(() => {
      beginPlayback();
      setPhase("revealed"); // overlay fades back out
      window.setTimeout(() => setPhase("idle"), 900);
    }, 900);
  }, [beginPlayback]);

  // Fresh-login arming: wait for the greeting to end, then run the intro once.
  useEffect(() => {
    if (!ready) return;
    let armed = false;
    try {
      armed = sessionStorage.getItem(LOGIN_FLAG) === "1";
      if (armed) sessionStorage.removeItem(LOGIN_FLAG);
    } catch {
      /* ignore */
    }
    if (!armed || startedRef.current) return;

    let fallback = 0;
    const start = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      window.removeEventListener(GREETING_ENDED, start);
      window.clearTimeout(fallback);
      runIntro();
    };
    window.addEventListener(GREETING_ENDED, start);
    fallback = window.setTimeout(start, GREETING_FALLBACK_MS);
    return () => {
      window.removeEventListener(GREETING_ENDED, start);
      window.clearTimeout(fallback);
    };
  }, [ready, runIntro]);

  const toggle = useCallback(() => {
    const p = playerRef.current;
    if (!ready || !p) return;
    if (playing) p.pauseVideo();
    else beginPlayback();
  }, [ready, playing, beginPlayback]);

  const restart = useCallback(() => {
    const p = playerRef.current;
    if (!ready || !p) return;
    p.seekTo(0, true);
    beginPlayback();
  }, [ready, beginPlayback]);

  // Skip: in the intro, jump straight into random; otherwise next random video.
  const skip = useCallback(() => {
    const p = playerRef.current;
    if (!ready || !p) return;
    if (modeRef.current === "first") goRandomRef.current();
    else p.nextVideo();
  }, [ready]);

  return (
    <>
      {/* Off-screen YouTube iframe (audio only). */}
      <div
        aria-hidden
        style={{ position: "fixed", width: 1, height: 1, left: -9999, top: -9999, opacity: 0, pointerEvents: "none" }}
      >
        <div ref={holderRef} />
      </div>

      {/* Cinematic blur overlay (fresh-login intro only). */}
      <div
        aria-hidden
        className={`pointer-events-none fixed inset-0 z-[90] backdrop-blur-md transition-opacity duration-700 ${
          phase === "blurring" ? "opacity-100" : "opacity-0"
        }`}
        style={{ background: "color-mix(in oklab, var(--background) 35%, transparent)" }}
      />

      {/* Bottom-right trigger + hover-revealed control bar. */}
      <div className="group fixed bottom-4 right-4 z-50 flex items-center justify-end gap-2">
        {/* Control bar — parked off-screen, slides in on hover/focus. */}
        <div className="pointer-events-none flex translate-x-3 items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)]/95 px-2 py-1.5 opacity-0 shadow-lg backdrop-blur transition-all duration-300 group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-x-0 group-focus-within:opacity-100">
          <button
            type="button"
            onClick={restart}
            disabled={!ready}
            title="Restart"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)] disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggle}
            disabled={!ready}
            title={playing ? "Pause" : "Play"}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--foreground)] hover:bg-[var(--accent)] disabled:opacity-40"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={skip}
            disabled={!ready}
            title="Skip to a random video"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)] disabled:opacity-40"
          >
            <SkipForward className="h-4 w-4" />
          </button>

          <span className="mx-0.5 h-5 w-px bg-[var(--border)]" />

          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            disabled={!ready}
            title={muted ? "Unmute" : "Mute"}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)] disabled:opacity-40"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => {
              setVolume(Number(e.target.value));
              if (muted) setMuted(false);
            }}
            title="Volume"
            className="h-1 w-20 cursor-pointer accent-[var(--primary)]"
          />
        </div>

        {/* Always-visible small trigger icon. */}
        <button
          type="button"
          onClick={toggle}
          title="Motivation"
          aria-label="Background motivation audio"
          className={`flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)]/95 shadow-lg backdrop-blur transition-colors hover:bg-[var(--accent)] ${
            playing ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]"
          }`}
        >
          <Music2 className={`h-4 w-4 ${playing ? "animate-pulse" : ""}`} />
        </button>
      </div>
    </>
  );
}
