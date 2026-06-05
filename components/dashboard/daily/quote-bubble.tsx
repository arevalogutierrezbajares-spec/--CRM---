"use client";

import { useEffect, useMemo, useState } from "react";
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

/**
 * A thought-bubble of motivational quotes in the top bar. The full quote + source
 * are always visible (wraps, fixed-height box, no cutoff). Auto-rotates every
 * `pace` seconds and tap-to-advance; ❤ favorites the current quote. Pace, the
 * favorites-only mode, and the favorites list are managed in app Settings — this
 * just reads those prefs from localStorage. initialIndex is server-seeded (no
 * Math.random in render); prefs hydrate in a rAF.
 */
export function QuoteBubble({ initialIndex }: { initialIndex: number }) {
  const [index, setIndex] = useState(((initialIndex % QUOTES.length) + QUOTES.length) % QUOTES.length);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [pace, setPace] = useState(DEFAULT_QUOTE_PACE);
  const [favOnly, setFavOnly] = useState(false);

  useEffect(() => {
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
    return () => cancelAnimationFrame(raf);
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
  function advance() {
    setIndex((cur) => pickDifferent(eligible, cur));
  }

  return (
    <div className="relative hidden min-w-0 lg:block">
      {/* thought-bubble tail: little circles rising toward the greeting above */}
      <span aria-hidden className="absolute -top-1.5 left-3 h-2 w-2 rounded-full border" style={{ background: "var(--bg-card)", borderColor: "var(--ai-border)" }} />
      <span aria-hidden className="absolute -top-[18px] left-1 h-1 w-1 rounded-full border" style={{ background: "var(--bg-card)", borderColor: "var(--ai-border)" }} />

      <div
        className="relative flex w-[min(56vw,640px)] items-stretch gap-2 rounded-[1.15rem] border px-3.5 py-2"
        style={{
          background: "linear-gradient(135deg, color-mix(in oklab, var(--purple-mid) 11%, var(--bg-card)) 0%, var(--bg-card) 75%)",
          borderColor: "var(--ai-border)",
        }}
      >
        <button type="button" onClick={advance} className="flex min-h-[62px] min-w-0 flex-1 flex-col justify-center text-left" aria-label="Next quote" title="Tap for another">
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
