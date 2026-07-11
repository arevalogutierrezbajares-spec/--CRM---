"use client";

import { motion } from "framer-motion";

/**
 * Entrance choreography for room sections — the same fade+rise language as the
 * sign-in, so the cinematic feel carries into the room. Above-the-fold blocks
 * animate on mount (staggered via `delay`); pass `inView` for below-the-fold
 * cards so they rise as the guest scrolls to them. Server children pass
 * through untouched; reduced motion collapses to instant via MotionConfig.
 */
export function Reveal({
  children,
  delay = 0,
  inView = false,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  inView?: boolean;
  className?: string;
}) {
  const visible = { opacity: 1, y: 0 };
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      {...(inView
        ? { whileInView: visible, viewport: { once: true, margin: "-60px" } }
        : { animate: visible })}
      transition={{ duration: 0.55, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
