"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Music2, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { isAudioMuted, onAudioMuteChange } from "@/lib/audio-mute";

/**
 * Ambient motivation player. Streams a RANDOM video from the Motiversity
 * YouTube channel (@motiversity) as background audio across the whole app.
 *
 * How "random from the channel" works without an API key: every channel has an
 * auto-generated "uploads" playlist whose id is the channel id with UC->UU. We
 * embed that playlist, turn shuffle ON, and jump to a random start index — so
 * each session plays a different video and auto-advances forever.
 *
 * The YouTube iframe is parked off-screen (audio only). A small music icon sits
 * bottom-right; hovering it slides up a control bar (return / play / skip + vol).
 *
 * On a FRESH login, after the ÑIGO greeting ends (`agb:greeting-ended`), the
 * screen blurs for a beat and then playback begins. Armed by the one-shot
 * `agb_play_ambient` flag the sign-in flow sets. Respects the global mute.
 */

// Motiversity channel UCAPByrKU5-R1emswVlyH_-g -> uploads playlist (UC -> UU).
const UPLOADS_PLAYLIST = "UUAPByrKU5-R1emswVlyH_-g";
// Embedded playlists surface up to ~200 items; randomise the entry point within.
const RANDOM_INDEX_RANGE = 200;

const LS_VOLUME = "agb.ambient.volume";
const LOGIN_FLAG = "agb_play_ambient";
const GREETING_ENDED = "agb:greeting-ended";
// If the greeting never fires (muted / autoplay blocked), start anyway after this.
const GREETING_FALLBACK_MS = 6000;

const YT_PLAYING = 1;

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  nextVideo: () => void;
  previousVideo: () => void;
  mute: () => void;
  unMute: () => void;
  setVolume: (v: number) => void;
  setShuffle: (on: boolean) => void;
  playVideoAt: (i: number) => void;
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

type Phase = "idle" | "blurring" | "revealed";

export function AmbientPlayer() {
  const holderRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const startedRef = useRef(false); // guards the one-shot login start sequence

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

  // Create the hidden player once, loading the channel's shuffled uploads.
  useEffect(() => {
    let cancelled = false;
    // A different random entry point each session (Math.random is fine in the browser).
    const startIndex = Math.floor(Math.random() * RANDOM_INDEX_RANGE);
    loadYouTubeApi().then(() => {
      if (cancelled || !holderRef.current || playerRef.current) return;
      playerRef.current = new window.YT!.Player(holderRef.current, {
        height: "1",
        width: "1",
        playerVars: {
          listType: "playlist",
          list: UPLOADS_PLAYLIST,
          index: startIndex,
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          loop: 1,
          playsinline: 1,
          modestbranding: 1,
        },
        events: {
          onReady: (e: { target: YTPlayer }) => {
            e.target.setShuffle(true);
            setReady(true);
          },
          onStateChange: (e: { data: number }) => {
            if (e.data === window.YT?.PlayerState.PLAYING) setPlaying(true);
            else if (e.data === window.YT?.PlayerState.PAUSED) setPlaying(false);
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
    // Verify it actually started with sound; if not, recover gracefully.
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

  const next = useCallback(() => playerRef.current?.nextVideo(), []);
  const prev = useCallback(() => playerRef.current?.previousVideo(), []);

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
        <div
          className="pointer-events-none flex translate-x-3 items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)]/95 px-2 py-1.5 opacity-0 shadow-lg backdrop-blur transition-all duration-300 group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-x-0 group-focus-within:opacity-100"
        >
          <button
            type="button"
            onClick={prev}
            disabled={!ready}
            title="Previous"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)] disabled:opacity-40"
          >
            <SkipBack className="h-4 w-4" />
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
            onClick={next}
            disabled={!ready}
            title="Skip"
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
