"use client";

import { motion } from "framer-motion";

/**
 * Living ambient backdrop for the no-video hero. Two slow-drifting brand-tinted
 * blobs plus a faint sheen give the entrance a sense of being alive without
 * pulling focus from the welcome copy. Reduced motion collapses to a static
 * gradient via the app-wide MotionConfig (reducedMotion="user"), so the initial
 * frame is already a pleasant resting state.
 */
export function HeroAurora() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Resting gradient — what reduced-motion viewers see, and the frame the
          blobs drift over. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 0% 0%, color-mix(in oklab, var(--primary) 10%, transparent), transparent 60%), radial-gradient(120% 80% at 100% 0%, color-mix(in oklab, var(--primary) 6%, transparent), transparent 55%)",
        }}
      />
      <motion.div
        className="absolute -left-24 -top-24 h-72 w-72 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--primary) 22%, transparent), transparent 70%)",
        }}
        animate={{ x: [0, 40, -10, 0], y: [0, 30, 10, 0], scale: [1, 1.12, 0.98, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-20 top-4 h-64 w-64 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--primary) 16%, transparent), transparent 70%)",
        }}
        animate={{ x: [0, -30, 12, 0], y: [0, 20, -12, 0], scale: [1, 1.08, 1.02, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
      />
      {/* Faint traveling sheen across the top edge. */}
      <motion.div
        className="absolute inset-x-0 -top-1/2 h-full"
        style={{
          background:
            "linear-gradient(100deg, transparent 30%, color-mix(in oklab, var(--primary) 8%, transparent) 50%, transparent 70%)",
        }}
        animate={{ x: ["-30%", "30%", "-30%"] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
