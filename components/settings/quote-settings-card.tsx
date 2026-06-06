"use client";

import { useEffect, useRef, useState } from "react";
import { Heart, Volume2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMON_BROADCAST_MESSAGES, QUOTES, type Quote } from "@/lib/quotes";
import {
  DEFAULT_QUOTE_PACE,
  NIGO_DEMON_DISABLED_KEY,
  NIGO_DEMON_MODE_KEY,
  QUOTE_FAVONLY_KEY,
  QUOTE_FAVS_KEY,
  QUOTE_PACE_KEY,
  readDisabledBroadcasts,
} from "@/lib/quote-prefs";

/** Manage the ÑIGO Home bubble: rotation pace, Demon Mode, favorites-only mode,
 *  and the favorites list. Persists to localStorage (the same keys the bubble reads). */
export function QuoteSettingsCard() {
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [pace, setPace] = useState(DEFAULT_QUOTE_PACE);
  const [favOnly, setFavOnly] = useState(false);
  const [demonMode, setDemonMode] = useState(false);
  const [demonDisabled, setDemonDisabled] = useState<Set<string>>(new Set());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try {
        const f = localStorage.getItem(QUOTE_FAVS_KEY);
        setFavs(f ? new Set(JSON.parse(f)) : new Set());
        const p = Number(localStorage.getItem(QUOTE_PACE_KEY));
        if (Number.isFinite(p) && p >= 3) setPace(p);
        setFavOnly(localStorage.getItem(QUOTE_FAVONLY_KEY) === "1");
        setDemonMode(localStorage.getItem(NIGO_DEMON_MODE_KEY) === "1");
        setDemonDisabled(readDisabledBroadcasts());
      } catch {
        /* ignore */
      }
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  function changePace(v: number) {
    const clamped = Math.max(3, Math.min(600, Math.round(v || DEFAULT_QUOTE_PACE)));
    setPace(clamped);
    try {
      localStorage.setItem(QUOTE_PACE_KEY, String(clamped));
    } catch {
      /* ignore */
    }
  }
  function toggleFavOnly() {
    const next = !favOnly;
    setFavOnly(next);
    try {
      localStorage.setItem(QUOTE_FAVONLY_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }
  function toggleDemonMode() {
    const next = !demonMode;
    setDemonMode(next);
    try {
      localStorage.setItem(NIGO_DEMON_MODE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }
  /** Preview a broadcast's original clip (deliberate click → plays even if the
   *  global mute is on; mute only governs the auto-rotation). */
  function playSample(q: Quote) {
    const audio = sampleAudioRef.current;
    if (!audio || !q.audioSrc) return;
    audio.pause();
    audio.currentTime = 0;
    audio.src = q.audioSrc;
    setPlayingId(q.audioSrc);
    void audio.play().catch(() => setPlayingId(null));
  }
  /** Toggle whether a broadcast is announced in the rotation. */
  function toggleBroadcast(id: string) {
    setDemonDisabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(NIGO_DEMON_DISABLED_KEY, JSON.stringify(Array.from(next)));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function removeFav(text: string) {
    const next = new Set(favs);
    next.delete(text);
    setFavs(next);
    try {
      localStorage.setItem(QUOTE_FAVS_KEY, JSON.stringify(Array.from(next)));
    } catch {
      /* ignore */
    }
  }

  const favList = QUOTES.filter((q) => favs.has(q.text));

  return (
    <Card>
      <CardHeader>
        <CardTitle>ÑIGO voice & Demon Mode</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
          <span className="text-text-secondary">Home message rotation</span>
          <span className="flex items-center gap-1.5">
            <input
              type="number"
              min={3}
              max={600}
              value={pace}
              onChange={(e) => changePace(Number(e.target.value))}
              className="h-11 w-24 rounded border bg-transparent px-3 text-right text-sm tabular-nums outline-none sm:h-8 sm:w-20 sm:px-2"
              style={{ borderColor: "var(--border-default)" }}
            />
            <span className="text-xs text-[var(--muted-foreground)]">seconds</span>
          </span>
        </label>

        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm">
          <span className="text-text-secondary">Show favorites only</span>
          <input type="checkbox" checked={favOnly} onChange={toggleFavOnly} className="h-5 w-5 cursor-pointer accent-[var(--blue-mid)]" />
        </label>

        <div className="rounded-xl border p-3" style={{ borderColor: "var(--border-default)" }}>
          <label className="flex min-h-11 cursor-pointer items-start justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span className="block font-medium text-text-secondary">DEMON Mode</span>
              <span className="mt-0.5 block text-xs leading-5 text-[var(--muted-foreground)]">
                Mixes real broadcast soundbites into the Home bubble (plays the original audio on hover/click). Preview each below and choose which are in the loop.
              </span>
            </span>
            <input
              type="checkbox"
              checked={demonMode}
              onChange={toggleDemonMode}
              className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-[var(--red-text)]"
            />
          </label>
          {demonMode && (
            <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border-default)" }}>
              <div className="mb-2 flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
                <span>Broadcasts</span>
                <span className="tabular-nums">{DEMON_BROADCAST_MESSAGES.length - demonDisabled.size} of {DEMON_BROADCAST_MESSAGES.length} in loop</span>
              </div>
              <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {DEMON_BROADCAST_MESSAGES.map((q) => {
                  const id = q.audioSrc ?? q.ref;
                  const inLoop = !demonDisabled.has(id);
                  const isPlaying = playingId === id;
                  return (
                    <li key={id} className="flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-surface">
                      <button
                        type="button"
                        onClick={() => playSample(q)}
                        aria-label={`Hear sample: ${q.text}`}
                        title="Hear sample"
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border transition hover:text-text-primary ${
                          isPlaying ? "border-[var(--green-text)] text-[var(--green-text)]" : "text-text-tertiary"
                        }`}
                        style={isPlaying ? undefined : { borderColor: "var(--border-default)" }}
                      >
                        <Volume2 size={14} className={isPlaying ? "animate-pulse" : ""} />
                      </button>
                      <span className="min-w-0 flex-1 truncate text-xs text-text-secondary" title={q.text}>
                        {q.text}
                      </span>
                      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-text-tertiary">
                        <input
                          type="checkbox"
                          checked={inLoop}
                          onChange={() => toggleBroadcast(id)}
                          className="h-4 w-4 cursor-pointer accent-[var(--red-text)]"
                        />
                        In loop
                      </label>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">Changes apply next time you open Home.</p>
              <audio ref={sampleAudioRef} preload="none" onEnded={() => setPlayingId(null)} onPause={() => setPlayingId(null)} />
            </div>
          )}
        </div>

        <div className="border-t pt-3" style={{ borderColor: "var(--border-default)" }}>
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-text-secondary">
            <Heart size={13} className="text-[var(--red-text)]" fill="currentColor" /> Favorites · {favList.length}
          </div>
          {favList.length === 0 ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              Tap the ❤ on the quote bubble (top of Home) to save quotes here.
            </p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {favList.map((q) => (
                <li key={q.text} className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => removeFav(q.text)}
                    aria-label="Remove favorite"
                    title="Remove"
                    className="mt-0.5 shrink-0 text-[var(--red-text)] transition-opacity hover:opacity-70"
                  >
                    <Heart size={13} fill="currentColor" />
                  </button>
                  <span className="min-w-0 text-[13px]">
                    <span className="text-text-secondary">“{q.text}”</span>{" "}
                    <span className="font-mono text-[11px] text-text-tertiary">— {q.ref}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
