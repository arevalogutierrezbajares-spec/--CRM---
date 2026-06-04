"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/** Animated count-up. setState runs only inside the rAF callback (lint-safe). */
export function CountUp({ value, duration = 500 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Respect prefers-reduced-motion: no rAF loop; the value is rendered
    // directly below (no setState here — keeps the effect lint-safe).
    if (reduceMotion) return;
    const start = fromRef.current;
    const end = value;
    if (start === end) return;
    let raf = 0;
    let t0 = 0;
    const step = (t: number) => {
      if (!t0) t0 = t;
      const p = Math.min((t - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + (end - start) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = end;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduceMotion]);

  return <>{reduceMotion ? value : display}</>;
}
