"use client";

import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Heart } from "lucide-react";
import { DEMON_BROADCAST_MESSAGES, QUOTES, type Quote } from "@/lib/quotes";
import { DEFAULT_QUOTE_PACE, NIGO_DEMON_MODE_KEY, QUOTE_FAVONLY_KEY, QUOTE_FAVS_KEY, QUOTE_PACE_KEY, readDisabledBroadcasts } from "@/lib/quote-prefs";
import { isAudioMuted, onAudioMuteChange } from "@/lib/audio-mute";

function pickDifferent(pool: number[], current: number): number {
  if (pool.length <= 1) return pool[0] ?? current;
  let n = current;
  while (n === current) n = pool[Math.floor(Math.random() * pool.length)];
  return n;
}

function quoteCacheKey(quote: Pick<Quote, "text" | "ref">) {
  return `${quote.ref}\u0000${quote.text}`;
}

/**
 * A thought-bubble of motivational quotes in the top bar. The full quote + source
 * are always visible (wraps, fixed-height box, no cutoff). Auto-rotates every
 * `pace` seconds, hover speaks, single click speaks current, and double-click
 * advances to the next message.
 * favorites the current quote. Pace, the favorites-only mode, and the favorites
 * list are managed in app Settings — this just reads those prefs from
 * localStorage. initialIndex is server-seeded (no Math.random in render);
 * prefs hydrate in a rAF.
 */
export function QuoteBubble({ initialIndex }: { initialIndex: number }) {
  const [index, setIndex] = useState(((initialIndex % QUOTES.length) + QUOTES.length) % QUOTES.length);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [pace, setPace] = useState(DEFAULT_QUOTE_PACE);
  const [favOnly, setFavOnly] = useState(false);
  const [demonMode, setDemonMode] = useState(false);
  const [demonDisabled, setDemonDisabled] = useState<Set<string>>(new Set());
  const [isSpeaking, setIsSpeaking] = useState(false);

  const lastHoveredIndex = useRef<number | null>(null);
  const lastHoverSpeakAt = useRef(0);
  const speakRequest = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechCache = useRef(new Map<string, string>());
  const clickTimer = useRef<number | null>(null);
  const CLICK_TO_ADVANCE_DELAY_MS = 180;

  const messages = useMemo<Quote[]>(
    () =>
      demonMode
        ? [...QUOTES, ...DEMON_BROADCAST_MESSAGES.filter((b) => !demonDisabled.has(b.audioSrc ?? ""))]
        : QUOTES,
    [demonMode, demonDisabled],
  );

  useEffect(() => {
    const audio = audioRef.current;
    const cached = speechCache.current;

    const raf = requestAnimationFrame(() => {
      try {
        const f = localStorage.getItem(QUOTE_FAVS_KEY);
        const savedFavs: Set<string> = f ? new Set(JSON.parse(f)) : new Set();
        const p = Number(localStorage.getItem(QUOTE_PACE_KEY));
        const fo = localStorage.getItem(QUOTE_FAVONLY_KEY) === "1";
        const dm = localStorage.getItem(NIGO_DEMON_MODE_KEY) === "1";
        const hydratedMessages = dm ? [...QUOTES, ...DEMON_BROADCAST_MESSAGES] : QUOTES;
        setFavs(savedFavs);
        if (Number.isFinite(p) && p >= 3) setPace(p);
        setFavOnly(fo);
        setDemonMode(dm);
        setDemonDisabled(readDisabledBroadcasts());
        if (fo && savedFavs.size > 0) {
          const next = hydratedMessages.findIndex(
            (quote) => quote.kind !== "demon-broadcast" && savedFavs.has(quote.text),
          );
          if (next >= 0) setIndex(next);
        }
      } catch {
        /* ignore */
      }
    });
    return () => {
      cancelAnimationFrame(raf);
      abortRef.current?.abort();
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      for (const url of cached.values()) {
        URL.revokeObjectURL(url);
      }
      cached.clear();
      if (clickTimer.current) {
        clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }
    };
  }, []);

  const eligible = useMemo(() => {
    const all = messages.map((_, i) => i);
    if (!favOnly) return all;
    const favIdx = all.filter(
      (i) => messages[i].kind !== "demon-broadcast" && favs.has(messages[i].text),
    );
    return favIdx.length > 0 ? favIdx : all;
  }, [favOnly, favs, messages]);

  useEffect(() => {
    const id = setInterval(() => setIndex((cur) => pickDifferent(eligible, cur)), Math.max(3, pace) * 1000);
    return () => clearInterval(id);
  }, [pace, eligible]);

  // Stop any in-flight speech the moment the user mutes.
  useEffect(
    () =>
      onAudioMuteChange((muted) => {
        if (!muted) return;
        abortRef.current?.abort();
        const audio = audioRef.current;
        if (audio) {
          audio.pause();
          audio.currentTime = 0;
        }
        setIsSpeaking(false);
      }),
    [],
  );

  const currentIndex = ((index % messages.length) + messages.length) % messages.length;
  const q = messages[currentIndex] ?? QUOTES[0];
  const isBroadcast = q.kind === "demon-broadcast";
  const isFav = !isBroadcast && favs.has(q.text);

  async function speakQuote(quote: Quote) {
    if (isAudioMuted()) return; // global mute → no quote/demon speech

    // Demon broadcasts play their ORIGINAL extracted audio clip (a static file),
    // never TTS — you hear the real soundbite, not a voice reading the transcript.
    if (quote.audioSrc) {
      ++speakRequest.current; // invalidate any in-flight TTS
      abortRef.current?.abort();
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      audio.currentTime = 0;
      audio.src = quote.audioSrc;
      try {
        await audio.play();
      } catch {
        setIsSpeaking(false);
      }
      return;
    }

    const requestId = ++speakRequest.current;
    const key = quoteCacheKey(quote);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let src = speechCache.current.get(key);
      if (!src) {
        const response = await fetch("/api/voice/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: quote.text, ref: quote.ref }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          throw new Error(detail || "Speech generation failed.");
        }

        const blob = await response.blob();
        src = URL.createObjectURL(blob);
        speechCache.current.set(key, src);
      }

      if (requestId !== speakRequest.current) return;

      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      audio.currentTime = 0;
      audio.src = src;
      await audio.play();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setIsSpeaking(false);
    }
  }

  function toggleFav(event: MouseEvent) {
    event.stopPropagation();
    if (isBroadcast) return;
    const next = new Set(favs);
    if (next.has(q.text)) next.delete(q.text);
    else next.add(q.text);
    setFavs(next);
    try {
      localStorage.setItem(QUOTE_FAVS_KEY, JSON.stringify(Array.from(next)));
    } catch {
      /* ignore */
    }
  }

  function handleClick() {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
    }
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      void speakQuote(q);
    }, CLICK_TO_ADVANCE_DELAY_MS);
  }

  function handleDoubleClick() {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    const next = pickDifferent(eligible, currentIndex);
    setIndex(next);
    void speakQuote(messages[next]);
  }

  function handleMouseEnter() {
    const now = Date.now();
    if (lastHoveredIndex.current === currentIndex && now - lastHoverSpeakAt.current < 500) return;
    lastHoveredIndex.current = currentIndex;
    lastHoverSpeakAt.current = now;
    void speakQuote(q);
  }

  function handleMouseLeave() {
    lastHoveredIndex.current = null;
  }

  return (
    <div className="relative hidden min-w-0 lg:block">
      <span
        aria-hidden
        className="absolute -top-1.5 left-3 h-2 w-2 rounded-full border"
        style={{ background: "var(--bg-card)", borderColor: "var(--ai-border)" }}
      />
      <span
        aria-hidden
        className="absolute -top-[18px] left-1 h-1 w-1 rounded-full border"
        style={{ background: "var(--bg-card)", borderColor: "var(--ai-border)" }}
      />

      <div
        className="relative flex w-[min(56vw,640px)] items-stretch gap-2 rounded-[1.15rem] border px-3.5 py-2"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in oklab, var(--purple-mid) 11%, var(--bg-card)) 0%, var(--bg-card) 75%)",
          borderColor: "var(--ai-border)",
        }}
      >
        <button
          type="button"
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className="relative flex min-h-[62px] min-w-0 flex-1 flex-col justify-center rounded-[1.15rem] text-left"
          aria-label="Replay message or double-click for next"
          title={
            isSpeaking ? "Playing message" : "Hover to hear this message, click to replay, double-click for next"
          }
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, y: 4, filter: "blur(3px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -4, filter: "blur(3px)" }}
              transition={{ duration: 0.24, ease: "easeOut" }}
            >
              <p className="text-[12.5px] italic leading-snug text-text-secondary">“{q.text}”</p>
              <span className="mt-0.5 block font-mono text-[10.5px] text-text-tertiary">— {q.ref}</span>
            </motion.div>
          </AnimatePresence>
        </button>

        <audio
          ref={audioRef}
          preload="none"
          onPlay={() => setIsSpeaking(true)}
          onEnded={() => setIsSpeaking(false)}
          onPause={() => setIsSpeaking(false)}
        />

        {!isBroadcast && (
          <button
            type="button"
            onClick={toggleFav}
            aria-pressed={isFav}
            aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
            title={isFav ? "Unfavorite" : "Favorite this quote"}
            className="flex shrink-0 items-center self-center rounded-full p-1 text-text-tertiary transition-colors hover:text-[var(--red-text)]"
          >
            <Heart size={15} className={isFav ? "text-[var(--red-text)]" : ""} fill={isFav ? "currentColor" : "none"} />
          </button>
        )}
      </div>
    </div>
  );
}
