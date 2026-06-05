"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, Settings2, X } from "lucide-react";
import { QUOTES } from "@/lib/quotes";

const FAVS_KEY = "agb_quotes_favs";
const PACE_KEY = "agb_quotes_pace";
const FAVONLY_KEY = "agb_quotes_favonly";
const DEFAULT_PACE = 10;

function pickDifferent(pool: number[], current: number): number {
  if (pool.length <= 1) return pool[0] ?? current;
  let n = current;
  while (n === current) n = pool[Math.floor(Math.random() * pool.length)];
  return n;
}

/**
 * A thought-bubble of motivational quotes for the top bar. The full quote + its
 * source are always visible (fixed-height box, no cutoff). Auto-rotates every
 * `pace` seconds (customizable), tap to advance, ❤ to favorite. The gear opens
 * settings: rotation pace, a "favorites only" mode, and the favorites list.
 * Favorites/pace/mode persist in localStorage. initialIndex is server-seeded so
 * there's no Math.random in render; hydration of saved prefs happens in a rAF.
 */
export function QuoteBubble({ initialIndex }: { initialIndex: number }) {
  const [index, setIndex] = useState(((initialIndex % QUOTES.length) + QUOTES.length) % QUOTES.length);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [pace, setPace] = useState(DEFAULT_PACE);
  const [favOnly, setFavOnly] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Hydrate saved prefs after mount (rAF callback — not the effect body).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try {
        const f = localStorage.getItem(FAVS_KEY);
        const savedFavs: Set<string> = f ? new Set(JSON.parse(f)) : new Set();
        const p = Number(localStorage.getItem(PACE_KEY));
        const fo = localStorage.getItem(FAVONLY_KEY) === "1";
        setFavs(savedFavs);
        if (Number.isFinite(p) && p >= 3) setPace(p);
        setFavOnly(fo);
        // If favorites-only is on, jump to a favorite straight away.
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

  // Auto-rotate. setState only in the interval callback; re-armed when the pace
  // or the eligible set changes (so it never rotates to a stale pool).
  useEffect(() => {
    const id = setInterval(() => setIndex((cur) => pickDifferent(eligible, cur)), Math.max(3, pace) * 1000);
    return () => clearInterval(id);
  }, [pace, eligible]);

  const q = QUOTES[index];
  const isFav = favs.has(q.text);

  function persistFavs(next: Set<string>) {
    try {
      localStorage.setItem(FAVS_KEY, JSON.stringify(Array.from(next)));
    } catch {
      /* ignore */
    }
  }
  function toggleFav() {
    const next = new Set(favs);
    if (next.has(q.text)) next.delete(q.text);
    else next.add(q.text);
    setFavs(next);
    persistFavs(next);
  }
  function removeFav(text: string) {
    const next = new Set(favs);
    next.delete(text);
    setFavs(next);
    persistFavs(next);
  }
  function advance() {
    setIndex((cur) => pickDifferent(eligible, cur));
  }
  function changePace(v: number) {
    const clamped = Math.max(3, Math.min(600, Math.round(v)));
    setPace(clamped);
    try {
      localStorage.setItem(PACE_KEY, String(clamped));
    } catch {
      /* ignore */
    }
  }
  function toggleFavOnly() {
    const next = !favOnly;
    setFavOnly(next);
    try {
      localStorage.setItem(FAVONLY_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  const favList = useMemo(() => QUOTES.filter((qq) => favs.has(qq.text)), [favs]);

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
        {/* Quote (full, never cut off) — click to advance */}
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

        {/* Actions: favorite + settings */}
        <div className="flex shrink-0 flex-col items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={toggleFav}
            aria-pressed={isFav}
            aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
            title={isFav ? "Unfavorite" : "Favorite this quote"}
            className="rounded-full p-1 text-text-tertiary transition-colors hover:text-[var(--red-text)]"
          >
            <Heart size={14} className={isFav ? "text-[var(--red-text)]" : ""} fill={isFav ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen((o) => !o)}
            aria-label="Quote settings"
            title="Quote settings"
            className="rounded-full p-1 text-text-tertiary transition-colors hover:text-text-secondary"
          >
            <Settings2 size={14} />
          </button>
        </div>

        {settingsOpen && (
          <div
            className="absolute right-0 top-full z-40 mt-1.5 w-72 rounded-lg border bg-card p-3 shadow-xl"
            style={{ borderColor: "var(--border-default)" }}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-label text-text-secondary">Quote settings</span>
              <button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close" className="text-text-tertiary hover:text-text-secondary">
                <X size={14} />
              </button>
            </div>

            <label className="flex items-center justify-between gap-2 py-1.5 text-[12.5px] text-text-secondary">
              Rotate every
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  min={3}
                  max={600}
                  value={pace}
                  onChange={(e) => changePace(Number(e.target.value))}
                  className="h-7 w-16 rounded border bg-transparent px-2 text-right text-[12.5px] tabular-nums outline-none"
                  style={{ borderColor: "var(--border-default)" }}
                />
                <span className="text-tiny text-text-tertiary">sec</span>
              </span>
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-2 py-1.5 text-[12.5px] text-text-secondary">
              Show favorites only
              <input type="checkbox" checked={favOnly} onChange={toggleFavOnly} className="h-4 w-4 cursor-pointer accent-[var(--blue-mid)]" />
            </label>

            <div className="mt-1.5 border-t pt-1.5" style={{ borderColor: "var(--border-default)" }}>
              <div className="mb-1 flex items-center gap-1 text-tiny text-text-tertiary">
                <Heart size={11} className="text-[var(--red-text)]" fill="currentColor" /> Favorites · {favList.length}
              </div>
              {favList.length === 0 ? (
                <p className="py-1 text-tiny text-text-tertiary">Tap the ❤ on a quote to save it here.</p>
              ) : (
                <ul className="max-h-44 space-y-1 overflow-y-auto pr-1">
                  {favList.map((fq) => (
                    <li key={fq.text} className="flex items-start gap-1.5">
                      <button type="button" onClick={() => removeFav(fq.text)} aria-label="Remove favorite" className="mt-0.5 shrink-0 text-[var(--red-text)]" title="Remove">
                        <Heart size={11} fill="currentColor" />
                      </button>
                      <span className="min-w-0 text-tiny text-text-secondary">
                        <span className="line-clamp-2">{fq.text}</span>
                        <span className="font-mono text-[9.5px] text-text-tertiary">— {fq.ref}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
