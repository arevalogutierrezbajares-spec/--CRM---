"use client";

import { MotionConfig } from "framer-motion";

/**
 * App-wide framer-motion config. `reducedMotion="user"` makes every motion
 * component honor the OS `prefers-reduced-motion: reduce` setting automatically
 * (transforms/animations collapse to instant), satisfying WCAG 2.3.3.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
