"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QUOTES } from "@/lib/quotes";

/**
 * A thought-bubble of scripture for the top bar (right of the greeting). Tap to
 * pop a fresh verse (random, never twice in a row) with a blur-in transition; the
 * reference sits low-key beside it, full text on hover. initialIndex is seeded
 * server-side (no Math.random in render); new picks happen in the click handler.
 */
export function QuoteBubble({ initialIndex }: { initialIndex: number }) {
  const [index, setIndex] = useState(((initialIndex % QUOTES.length) + QUOTES.length) % QUOTES.length);
  const q = QUOTES[index];

  function next() {
    if (QUOTES.length < 2) return;
    let n = index;
    while (n === index) n = Math.floor(Math.random() * QUOTES.length);
    setIndex(n);
  }

  return (
    <div className="relative hidden min-w-0 lg:block">
      {/* thought-bubble tail: little circles trailing toward the greeting */}
      <span
        aria-hidden
        className="absolute -bottom-1.5 left-1.5 h-2 w-2 rounded-full border"
        style={{ background: "var(--bg-card)", borderColor: "var(--ai-border)" }}
      />
      <span
        aria-hidden
        className="absolute -bottom-3 left-0 h-1 w-1 rounded-full border"
        style={{ background: "var(--bg-card)", borderColor: "var(--ai-border)" }}
      />
      <motion.button
        type="button"
        onClick={next}
        whileTap={{ scale: 0.97 }}
        title={`${q.text} — ${q.ref}  (tap for another)`}
        aria-label="Show another verse"
        className="group relative flex min-w-0 max-w-[34vw] items-center gap-2 rounded-[1.15rem] border px-3 py-1.5"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in oklab, var(--purple-mid) 11%, var(--bg-card)) 0%, var(--bg-card) 75%)",
          borderColor: "var(--ai-border)",
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={index}
            initial={{ opacity: 0, y: 4, filter: "blur(3px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -4, filter: "blur(3px)" }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="flex min-w-0 items-baseline gap-2"
          >
            <span className="truncate text-[12px] italic leading-tight text-text-secondary">“{q.text}”</span>
            <span className="shrink-0 font-mono text-[10px] text-text-tertiary">{q.ref}</span>
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
