"use client";

import { useEffect, useRef, useState } from "react";

export const DECK_W = 1280;
export const DECK_H = 720;

export type DeckFit = { scale: number; rotate: boolean };

/**
 * Fit a fixed 1280×720 deck into its container. Rotating 90° wins on portrait
 * phones (a landscape deck fills far more of the screen sideways), so we pick
 * whichever orientation yields the larger scale. Returns a wrapper ref plus the
 * scale + rotate flag to build the iframe transform.
 *
 * setState lives in the ResizeObserver callback (async, not the effect body), so
 * it satisfies the no-setState-in-effect rule and reacts to every resize/rotate.
 */
export function useDeckFit(): { ref: React.RefObject<HTMLDivElement | null> } & DeckFit {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<DeckFit>({ scale: 0, rotate: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      if (width <= 0 || height <= 0) {
        setFit({ scale: 0, rotate: false });
        return;
      }
      const upright = Math.min(width / DECK_W, height / DECK_H);
      const rotated = Math.min(width / DECK_H, height / DECK_W);
      const rotate = rotated > upright;
      const scale = Math.max(upright, rotated);
      setFit(
        Number.isFinite(scale) && scale > 0
          ? { scale, rotate }
          : { scale: 0, rotate: false },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, ...fit };
}
