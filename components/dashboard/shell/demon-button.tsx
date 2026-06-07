"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { DEMON_BROADCAST_MESSAGES, DEMON_CATEGORIES, DEMON_CATEGORY_LABEL, DEMON_SIGNATURE_SRC, type DemonCategory } from "@/lib/quotes";
import { readDisabledBroadcasts } from "@/lib/quote-prefs";

/** Remembers the last category the user picked (so a quick click replays from it). */
const CATEGORY_KEY = "agb_demon_category";

/**
 * Top-bar jaguar button. Click → plays a random sound from the active category.
 * Hover → a compact popover to pick a category and play a specific sound. Honors
 * the per-broadcast on/off pool from Settings. Deliberate action → plays even
 * when muted. setState only fires in rAF / events.
 */
export function DemonButton() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const closeTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<DemonCategory>(DEMON_CATEGORIES[0]);
  const [disabled, setDisabled] = useState<Set<string>>(new Set());
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setDisabled(readDisabledBroadcasts());
      try {
        const c = localStorage.getItem(CATEGORY_KEY);
        if (c && (DEMON_CATEGORIES as string[]).includes(c)) setCat(c as DemonCategory);
      } catch {
        /* ignore */
      }
    });
    return () => {
      cancelAnimationFrame(raf);
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  function poolFor(category: DemonCategory) {
    // The pinned signature (Motto) always shows; others honor the on/off pool.
    // Pinned sorts to the top.
    return DEMON_BROADCAST_MESSAGES.filter(
      (b) => b.audioSrc && b.category === category && (b.pinned || !disabled.has(b.audioSrc)),
    ).sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false));
  }
  function playSrc(src: string) {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    a.src = src;
    setPlaying(src);
    void a.play().catch(() => setPlaying(null));
  }
  function quickPlay() {
    // Signature line plays on EVERY click — always first, even if just played.
    playSrc(DEMON_SIGNATURE_SRC);
  }
  function selectCat(c: DemonCategory) {
    setCat(c);
    try {
      localStorage.setItem(CATEGORY_KEY, c);
    } catch {
      /* ignore */
    }
  }
  function openMenu() {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  }
  function scheduleClose() {
    closeTimer.current = window.setTimeout(() => setOpen(false), 160);
  }

  const sounds = poolFor(cat);

  return (
    <div className="relative hidden shrink-0 sm:block" onMouseEnter={openMenu} onMouseLeave={scheduleClose}>
      <audio ref={audioRef} preload="none" onEnded={() => setPlaying(null)} onPause={() => setPlaying(null)} />

      <button
        type="button"
        onClick={quickPlay}
        aria-label="Play the Motto — hover to pick a sound"
        title="Play the Motto — hover to pick"
        className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border opacity-90 transition hover:scale-110 hover:opacity-100"
        style={{ borderColor: "var(--border-default)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/jaguar-stalking.svg" alt="" className="h-[18px] w-[18px]" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[200px] rounded-xl border p-1.5 shadow-lg"
          style={{ background: "var(--bg-card)", borderColor: "var(--border-default)" }}
        >
          {/* Category pills */}
          <div className="flex flex-wrap gap-1">
            {DEMON_CATEGORIES.map((c) => {
              const active = c === cat;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => selectCat(c)}
                  className={`rounded-full px-2 py-0.5 font-mono text-[9.5px] font-medium uppercase tracking-wide transition-colors ${
                    active ? "text-white" : "text-text-tertiary hover:text-text-primary"
                  }`}
                  style={active ? { background: "var(--red-text)" } : { background: "var(--surface)" }}
                >
                  {DEMON_CATEGORY_LABEL[c]}
                </button>
              );
            })}
          </div>

          {/* Sounds in the active category */}
          <div className="mt-1.5 max-h-[176px] overflow-y-auto border-t pt-1" style={{ borderColor: "var(--border-default)" }}>
            {sounds.length === 0 ? (
              <p className="px-1.5 py-1.5 text-tiny text-text-tertiary">Nothing on in {DEMON_CATEGORY_LABEL[cat]}.</p>
            ) : (
              sounds.map((s) => {
                const isPlaying = playing === s.audioSrc;
                return (
                  <button
                    key={s.audioSrc}
                    type="button"
                    onClick={() => s.audioSrc && playSrc(s.audioSrc)}
                    title={s.text}
                    className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-surface hover:text-text-primary ${
                      s.pinned ? "font-medium text-text-primary" : "text-text-secondary"
                    }`}
                  >
                    <Play
                      size={11}
                      className={`shrink-0 ${
                        isPlaying ? "text-[var(--green-text)]" : s.pinned ? "text-[var(--red-text)]" : "text-text-tertiary"
                      }`}
                      fill="currentColor"
                    />
                    <span className="truncate">{s.name ?? s.text}</span>
                    {s.pinned && <span aria-hidden className="ml-auto shrink-0 text-[9px]">📌</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
