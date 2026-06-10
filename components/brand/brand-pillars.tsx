"use client";

import { motion } from "framer-motion";

/**
 * The AGB three-pillar mark, animated. The center column rises out of the
 * ground first; the two leaning side pillars then bloom in from each side
 * with a springy overshoot (transform-origin at their feet so they "grow"
 * rather than slide). Pass `play=false` to render the mark statically.
 */
export function BrandPillars({
  size = 120,
  play = true,
  settle = false,
  className,
}: {
  size?: number;
  play?: boolean;
  settle?: boolean;
  className?: string;
}) {
  const spring = { type: "spring", stiffness: 170, damping: 14, mass: 1 } as const;

  return (
    <motion.svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={11}
      strokeLinejoin="miter"
      className={className}
      aria-hidden
      animate={settle ? { scale: [1, 1.07, 1] } : { scale: 1 }}
      transition={{ duration: 0.5, times: [0, 0.4, 1], ease: "easeOut" }}
    >
      {/* center column — blooms straight up from the baseline */}
      <motion.path
        d="M89 44 L111 44 L111 166 L89 166 Z"
        style={{ originX: 0.5, originY: 1 }}
        initial={play ? { scaleY: 0, scaleX: 1.3, opacity: 0 } : false}
        animate={{ scaleY: 1, scaleX: 1, opacity: 1 }}
        transition={{
          scaleY: spring,
          scaleX: { type: "spring", stiffness: 300, damping: 20 },
          opacity: { duration: 0.18 },
        }}
      />
      {/* left pillar — leans in from the left, planted at its foot */}
      <motion.path
        d="M62 44 L84 44 L44 166 L8 166 Z"
        style={{ originX: 1, originY: 1 }}
        initial={play ? { x: -64, rotate: -14, scaleY: 0.55, opacity: 0 } : false}
        animate={{ x: 0, rotate: 0, scaleY: 1, opacity: 1 }}
        transition={{
          delay: 0.18,
          x: { delay: 0.18, type: "spring", stiffness: 160, damping: 15 },
          rotate: { delay: 0.18, type: "spring", stiffness: 160, damping: 13 },
          scaleY: { delay: 0.18, ...spring },
          opacity: { delay: 0.18, duration: 0.18 },
        }}
      />
      {/* right pillar — mirror of the left, slightly later for asymmetry */}
      <motion.path
        d="M116 44 L138 44 L192 166 L156 166 Z"
        style={{ originX: 0, originY: 1 }}
        initial={play ? { x: 64, rotate: 14, scaleY: 0.55, opacity: 0 } : false}
        animate={{ x: 0, rotate: 0, scaleY: 1, opacity: 1 }}
        transition={{
          delay: 0.3,
          x: { delay: 0.3, type: "spring", stiffness: 160, damping: 15 },
          rotate: { delay: 0.3, type: "spring", stiffness: 160, damping: 13 },
          scaleY: { delay: 0.3, ...spring },
          opacity: { delay: 0.3, duration: 0.18 },
        }}
      />
    </motion.svg>
  );
}
