"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Quote as QuoteIcon, Sparkles } from "lucide-react";
import { QUOTES } from "@/lib/quotes";

/**
 * A friendly speech-bubble of scripture. Tap it to pop a fresh verse (random,
 * never the same twice in a row) with a soft blur-in transition. The reference
 * sits low-key under the text. initialIndex is seeded server-side so there's no
 * Math.random() during client render (react-hooks/purity); new picks happen in
 * the click handler. Honors prefers-reduced-motion via the app MotionConfig.
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
    <motion.button
      type="button"
      onClick={next}
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 240, damping: 22 }}
      whileTap={{ scale: 0.985 }}
      aria-label="Show another verse"
      className="group relative block w-full overflow-hidden rounded-2xl border px-5 py-4 text-left"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in oklab, var(--purple-mid) 12%, var(--bg-card)) 0%, var(--bg-card) 72%)",
        borderColor: "var(--ai-border)",
      }}
    >
      {/* watermark */}
      <QuoteIcon
        aria-hidden
        size={88}
        className="pointer-events-none absolute -right-3 -top-4 opacity-[0.06]"
        style={{ color: "var(--purple-mid)" }}
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 8, filter: "blur(5px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(5px)" }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="relative"
        >
          <p className="text-pretty text-[14.5px] font-medium leading-snug text-text-primary">
            “{q.text}”
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="font-mono text-tiny tracking-wide text-text-tertiary">{q.ref}</span>
            <span className="flex items-center gap-1 text-tiny text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100">
              tap for another <Sparkles size={11} />
            </span>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.button>
  );
}
