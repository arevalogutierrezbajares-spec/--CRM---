"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Sunrise, Sun, Moon } from "lucide-react";

/**
 * The greeting banner at the top of Home. Time-of-day aware (morning/afternoon/
 * evening word + icon, derived from the server-computed greeting string) with a
 * playful spring entrance: the icon pops + floats and the words stagger in.
 * Honors prefers-reduced-motion via the app-wide MotionConfig.
 */
const PERIOD = {
  morning: { Icon: Sunrise, color: "var(--amber-text)", glow: "rgba(184,142,47,0.20)" },
  afternoon: { Icon: Sun, color: "var(--amber-text)", glow: "rgba(212,168,85,0.16)" },
  evening: { Icon: Moon, color: "var(--blue-text)", glow: "rgba(96,128,208,0.18)" },
} as const;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.12 } },
};
const word = {
  hidden: { opacity: 0, y: 14, rotate: -5 },
  show: { opacity: 1, y: 0, rotate: 0, transition: { type: "spring", stiffness: 500, damping: 16 } },
} as const;

export function TodayBriefing({ greeting, hasUrgent }: { greeting: string; hasUrgent: boolean }) {
  const g = greeting.toLowerCase();
  const period = g.includes("morning") ? "morning" : g.includes("evening") ? "evening" : "afternoon";
  const { Icon, color, glow } = PERIOD[period];
  const words = greeting.split(" ");

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      className="relative overflow-hidden rounded-xl border-l-[3px] border-y border-r px-4 py-3.5"
      style={{
        background: "var(--ai-bg)",
        borderLeftColor: color,
        borderTopColor: "var(--ai-border)",
        borderRightColor: "var(--ai-border)",
        borderBottomColor: "var(--ai-border)",
      }}
    >
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.9 }}
        className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full blur-2xl"
        style={{ background: glow }}
      />

      <div className="relative flex items-center gap-2">
        <motion.span
          initial={{ scale: 0, rotate: -45 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 10, delay: 0.05 }}
          className="inline-flex"
        >
          <motion.span
            animate={{ y: [0, -2.5, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
            className="inline-flex"
          >
            <Icon size={18} style={{ color }} />
          </motion.span>
        </motion.span>

        <motion.h2
          variants={container}
          initial="hidden"
          animate="show"
          className="flex flex-wrap gap-x-1.5 text-[17px] font-semibold tracking-tight text-text-primary"
        >
          {words.map((w, i) => (
            <motion.span key={i} variants={word} className="inline-block">
              {w}
            </motion.span>
          ))}
        </motion.h2>
      </div>

      {!hasUrgent && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55, duration: 0.4 }}
          className="relative mt-1.5 flex items-center gap-1.5 text-[12.5px] text-text-secondary"
        >
          <CheckCircle2 size={13} className="text-green-mid" />
          Nothing pressing — clear runway. Good time to get ahead.
        </motion.div>
      )}
    </motion.div>
  );
}
