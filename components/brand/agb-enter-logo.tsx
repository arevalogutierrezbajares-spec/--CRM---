"use client";

import { useCallback, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Top-right AGB enter mark for the Caney landing.
 *
 * Idle: static mark, no glow.
 * Click: slow domino chain (left → center → right). Glow lives only on the
 * pillar strokes via SVG filter / drop-shadow — never a circular halo.
 */
export function AgbEnterLogo({
  onEnter,
  disabled = false,
  size = 44,
}: {
  onEnter: () => void;
  disabled?: boolean;
  size?: number;
}) {
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<"idle" | "animating">("idle");
  const [runKey, setRunKey] = useState(0);
  const busy = disabled || mode === "animating";

  // Domino chain: 3 pillars × stagger + fall + settle tail
  const CLICK_MS = 1450;

  const handleClick = useCallback(() => {
    if (busy) return;
    if (reduced) {
      onEnter();
      return;
    }
    setMode("animating");
    setRunKey((k) => k + 1);
    window.setTimeout(() => {
      onEnter();
    }, CLICK_MS);
  }, [busy, reduced, onEnter]);

  const hit = Math.max(size + 28, 60);
  const building = mode === "animating";

  return (
    <button
      type="button"
      aria-label="Enter"
      title="Enter"
      disabled={busy}
      onClick={handleClick}
      className="group relative z-50 touch-manipulation rounded-full border-0 bg-transparent p-0 outline-none transition-transform duration-300 hover:scale-[1.04] active:scale-[0.97] focus-visible:ring-1 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-default"
      style={{ width: hit, height: hit }}
    >
      <span
        className="relative z-10 flex items-center justify-center text-[#F0EEE8]"
        style={{ width: hit, height: hit }}
      >
        <DominoPillars
          key={runKey}
          size={size}
          building={building}
          reduced={!!reduced}
        />
      </span>
    </button>
  );
}

/**
 * Three pillars as a slow domino chain.
 * Glow is stroke-only (SVG feGaussianBlur + stroke brighten) — no circle.
 */
function DominoPillars({
  size,
  building,
  reduced,
}: {
  size: number;
  building: boolean;
  reduced: boolean;
}) {
  // Weighty cascade — a bit snappier than full slow-mo
  const STAGGER = 0.26;
  const FALL_S = 0.7;

  const pillars = [
    {
      d: "M62 44 L84 44 L44 166 L8 166 Z",
      originX: 0.12,
      originY: 1,
      // Start nearly flat, arc through the fall, overshoot, settle
      fromRotate: -92,
      delay: 0,
    },
    {
      d: "M89 44 L111 44 L111 166 L89 166 Z",
      originX: 0.5,
      originY: 1,
      fromRotate: -92,
      delay: STAGGER,
    },
    {
      d: "M116 44 L138 44 L192 166 L156 166 Z",
      originX: 0.88,
      originY: 1,
      fromRotate: 92,
      delay: STAGGER * 2,
    },
  ] as const;

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      fill="none"
      strokeLinejoin="miter"
      aria-hidden
      overflow="visible"
    >
      <defs>
        {/* Cream mark at rest */}
        <linearGradient id="agbIdleStroke" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#F5F2EA" />
          <stop offset="100%" stopColor="#D8D4CC" />
        </linearGradient>
        {/* Brighter cyan-cream only while building */}
        <linearGradient id="agbBuildStroke" x1="0%" y1="0%" x2="8%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="40%" stopColor="#CFF5FB" />
          <stop offset="100%" stopColor="#67E8F9" />
        </linearGradient>
        {/* Soft bloom that follows the stroke path — not a circle */}
        <filter
          id="agbLogoGlow"
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.8" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="
              0.4 0 0 0 0.15
              0 0.85 0 0 0.55
              0 0 0.95 0 0.7
              0 0 0 0.85 0"
            result="glow"
          />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g
        stroke={building ? "url(#agbBuildStroke)" : "url(#agbIdleStroke)"}
        strokeWidth={11}
        filter={building && !reduced ? "url(#agbLogoGlow)" : undefined}
        style={{
          transition: "stroke 0.4s ease",
        }}
      >
        {pillars.map((p, i) => (
          <motion.path
            key={i}
            d={p.d}
            style={{ originX: p.originX, originY: p.originY }}
            initial={false}
            animate={
              building && !reduced
                ? {
                    // Flat → mid-arc with stretch → overshoot past upright → settle
                    rotate: [
                      p.fromRotate,
                      p.fromRotate * 0.55,
                      p.fromRotate * 0.08,
                      p.fromRotate > 0 ? -4 : 4,
                      0,
                    ],
                    opacity: [0, 0.55, 1, 1, 1],
                    scaleY: [0.55, 0.85, 1.08, 0.97, 1],
                    scaleX: [1.15, 1.05, 0.94, 1.02, 1],
                    transition: {
                      duration: FALL_S,
                      delay: p.delay,
                      times: [0, 0.28, 0.62, 0.82, 1],
                      ease: [0.33, 0.0, 0.2, 1.15],
                    },
                  }
                : {
                    rotate: 0,
                    opacity: 1,
                    scaleY: 1,
                    scaleX: 1,
                  }
            }
          />
        ))}
      </g>
    </svg>
  );
}
