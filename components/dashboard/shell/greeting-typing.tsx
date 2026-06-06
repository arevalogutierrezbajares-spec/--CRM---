"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sunrise, Sun, Moon } from "lucide-react";

const ICON = { morning: Sunrise, afternoon: Sun, evening: Moon } as const;
const COLOR = { morning: "var(--amber-text)", afternoon: "var(--amber-text)", evening: "var(--blue-text)" } as const;
type Period = keyof typeof ICON;

/**
 * Pixar-style typewriter greeting in the CRM font: "Good evening, Top G" types
 * out character-by-character with a blinking caret and a springing time-of-day
 * icon. `period` is computed server-side in the user's tz. When `firstTitle` is
 * set, the *first* greeting of the session reads it (e.g. "Sir TIGR") to match
 * the voice, then later loads swap to `title` ("Master Top G"). setState only
 * fires in callbacks (interval / mount effect), never the effect body.
 */
export function GreetingTyping({ title, firstTitle, period }: { title: string; firstTitle?: string; period: Period }) {
  // Hydration-safe: render `title` on the server + first client render, then a
  // mount effect swaps to `firstTitle` if this is the session's first greeting.
  const [activeTitle, setActiveTitle] = useState(title);
  const full = `Good ${period}, ${activeTitle}`;
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!firstTitle) return;
    // rAF so the setState lands in a callback, not synchronously in the effect.
    const raf = requestAnimationFrame(() => {
      let greeted = false;
      try {
        greeted = sessionStorage.getItem("agb_greeted_v1") === "1"; // mirrors GreetingAudio SESSION_KEY
      } catch {
        /* ignore */
      }
      if (!greeted) {
        setActiveTitle(firstTitle);
        setN(0);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [firstTitle]);

  useEffect(() => {
    const id = setInterval(() => setN((c) => (c >= full.length ? c : c + 1)), 42);
    return () => clearInterval(id);
  }, [full]);

  const Icon = ICON[period];
  const done = n >= full.length;

  return (
    <div className="hidden shrink-0 items-center gap-2.5 sm:flex">
      <motion.span
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 11 }}
        className="inline-flex shrink-0"
      >
        <Icon size={22} style={{ color: COLOR[period] }} />
      </motion.span>
      <span className="truncate text-[21px] font-bold tracking-tight text-text-primary">
        {full.slice(0, n)}
        <span
          aria-hidden
          className={`ml-px inline-block w-[1.5px] translate-y-[1px] self-stretch bg-text-tertiary ${done ? "animate-pulse" : ""}`}
          style={{ height: "1em" }}
        />
      </span>
    </div>
  );
}
