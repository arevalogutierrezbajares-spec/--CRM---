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
 * icon. `period` is computed server-side in the user's tz. setState only fires in
 * the interval callback (never the effect body) → satisfies set-state-in-effect.
 */
export function GreetingTyping({ title, period }: { title: string; period: Period }) {
  const full = `Good ${period}, ${title}`;
  const [n, setN] = useState(0);

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
