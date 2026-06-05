"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Heart } from "lucide-react";
import { QUOTES } from "@/lib/quotes";
import { QUOTE_FAVS_KEY, QUOTE_PACE_KEY, QUOTE_FAVONLY_KEY, DEFAULT_QUOTE_PACE } from "@/lib/quote-prefs";

function pickDifferent(pool: number[], current: number): number {
  if (pool.length <= 1) return pool[0] ?? current;
  let n = current;
  while (n === current) n = pool[Math.floor(Math.random() * pool.length)];
  return n;
}

function quoteCacheKey(quote: { text: string; ref: string }) {
  return `${quote.ref}\u0000${quote.text}`;
}

/**
 * A thought-bubble of motivational quotes in the top bar. The full quote + source
 * are always visible (wraps, fixed-height box, no cutoff). Auto-rotates every
 * `pace` seconds, hover speaks, and single click advances to next.
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
  const [isSpeaking, setIsSpeaking] = useState(false);

  const lastHoveredIndex = useRef<number | null>(null);
  const speakRequest = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechCache = useRef(new Map<string, string>());

  useEffect(() => {
    const audio = audioRef.current;
    const cached = speechCache.current;

    const raf = requestAnimationFrame(() => {
      try {
        const f = localStorage.getItem(QUOTE_FAVS_KEY);
        const savedFavs: Set<string> = f ? new Set(JSON.parse(f)) : new Set();
        const p = Number(localStorage.getItem(QUOTE_PACE_KEY));
        const fo = localStorage.getItem(QUOTE_FAVONLY_KEY) === "1";
        setFavs(savedFavs);
        if (Number.isFinite(p) && p >= 3) setPace(p);
        setFavOnly(fo);
        if (fo && savedFavs.size > 0) {
          setIndex((cur) => (savedFavs.has(QUOTES[cur].text) ? cur : QUOTES.findIndex((q) => savedFavs.has(q.text))));
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
    };
  }, []);

  const eligible = useMemo(() => {
    const all = QUOTES.map((_, i) => i);
    if (!favOnly) return all;
    const favIdx = all.filter((i) => favs.has(QUOTES[i].text));
    return favIdx.length > 0 ? favIdx : all;
  }, [favOnly, favs]);

  useEffect(() => {
    const id = setInterval(() => setIndex((cur) => pickDifferent(eligible, cur)), Math.max(3, pace) * 1000);
    return () => clearInterval(id);
  }, [pace, eligible]);

  const q = QUOTES[index];
  const isFav = favs.has(q.text);

  async function speakQuote(quote: (typeof QUOTES)[number]) {
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

  function toggleFav() {
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
    const next = pickDifferent(eligible, index);
    setIndex(next);
    void speakQuote(QUOTES[next]);
  }

  function handleMouseEnter() {
    if (lastHoveredIndex.current === index) return;
    lastHoveredIndex.current = index;
    void speakQuote(QUOTES[index]);
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
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className="relative flex min-h-[62px] min-w-0 flex-1 flex-col justify-center rounded-[1.15rem] text-left"
          aria-label="Speak or advance quote"
          title={isSpeaking ? "Playing quote" : "Hover to hear this quote, click for next"}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={index}
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
      </div>
    </div>
  );
}
