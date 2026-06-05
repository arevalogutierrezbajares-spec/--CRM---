"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QUOTES } from "@/lib/quotes";
import { QUOTE_FAVS_KEY, QUOTE_PACE_KEY, QUOTE_FAVONLY_KEY, DEFAULT_QUOTE_PACE } from "@/lib/quote-prefs";

/** Manage the Home quote bubble: rotation pace, favorites-only mode, and the
 *  favorites list. Persists to localStorage (the same keys the bubble reads). */
export function QuoteSettingsCard() {
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [pace, setPace] = useState(DEFAULT_QUOTE_PACE);
  const [favOnly, setFavOnly] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try {
        const f = localStorage.getItem(QUOTE_FAVS_KEY);
        setFavs(f ? new Set(JSON.parse(f)) : new Set());
        const p = Number(localStorage.getItem(QUOTE_PACE_KEY));
        if (Number.isFinite(p) && p >= 3) setPace(p);
        setFavOnly(localStorage.getItem(QUOTE_FAVONLY_KEY) === "1");
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
        <CardTitle>Quote bubble</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center justify-between gap-2 text-sm">
          <span className="text-text-secondary">Rotate every</span>
          <span className="flex items-center gap-1.5">
            <input
              type="number"
              min={3}
              max={600}
              value={pace}
              onChange={(e) => changePace(Number(e.target.value))}
              className="h-8 w-20 rounded border bg-transparent px-2 text-right text-sm tabular-nums outline-none"
              style={{ borderColor: "var(--border-default)" }}
            />
            <span className="text-xs text-[var(--muted-foreground)]">seconds</span>
          </span>
        </label>

        <label className="flex cursor-pointer items-center justify-between gap-2 text-sm">
          <span className="text-text-secondary">Show favorites only</span>
          <input type="checkbox" checked={favOnly} onChange={toggleFavOnly} className="h-4 w-4 cursor-pointer accent-[var(--blue-mid)]" />
        </label>

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
