"use client";

/**
 * THE BRAIN — loading state (NFR-OBS-4: never a blank screen).
 *
 * Skeleton shown while the canvas client bundle / graph hydrates. Mirrors the
 * portfolio silhouette (a ring of system orbs + a couple of stations) so the
 * eventual content does not jump. Tokens are scoped under `.brain-root`; the
 * shimmer respects prefers-reduced-motion (no animation override needed because
 * the keyframe is gated by the media query below via inline <style>).
 */

import type { System } from "@/lib/brain/types";

const RING: System[] = ["vav", "caney", "crm", "restaurants", "academy"];

/** Deterministic positions on a circle (percent-based, matches portfolio ring). */
function ringPos(i: number, n: number, radius = 32) {
  const angle = (-90 + i * (360 / n)) * (Math.PI / 180);
  return {
    left: `${50 + radius * Math.cos(angle)}%`,
    top: `${50 + radius * Math.sin(angle)}%`,
  };
}

export function LoadingState({ label = "Mapping the portfolio…" }: { label?: string }) {
  return (
    <div
      className="brain-root"
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    >
      <style>{`
        @keyframes brain-skel-pulse { 0%,100%{opacity:.45} 50%{opacity:.85} }
        @media (prefers-reduced-motion: reduce){
          .brain-skel { animation: none !important; opacity: .6 !important; }
        }
      `}</style>

      {/* center hub silhouette */}
      <div
        className="brain-skel"
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%,-50%)",
          width: 120,
          height: 120,
          borderRadius: "50%",
          border: "1px solid var(--line-2)",
          background:
            "radial-gradient(circle at 38% 30%,rgba(255,255,255,.07),var(--bg-2) 64%)",
          boxShadow: "var(--shadow-med), var(--gleam)",
          animation: "brain-skel-pulse 1.6s var(--ease) infinite",
        }}
      />

      {/* ring of system orb silhouettes */}
      {RING.map((sys, i) => {
        const p = ringPos(i, RING.length);
        return (
          <div
            key={sys}
            className="brain-skel"
            aria-hidden="true"
            style={{
              position: "absolute",
              ...p,
              transform: "translate(-50%,-50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 7,
              animation: "brain-skel-pulse 1.6s var(--ease) infinite",
              animationDelay: `${i * 0.12}s`,
            }}
          >
            <div
              style={{
                width: 86,
                height: 86,
                borderRadius: "50%",
                border: "1px solid var(--line-2)",
                background:
                  "radial-gradient(circle at 38% 30%,rgba(255,255,255,.05),var(--bg-2) 64%)",
                boxShadow: "var(--shadow-low), var(--gleam)",
              }}
            />
            <span
              style={{
                width: 52,
                height: 9,
                borderRadius: 4,
                background: "var(--panel-s)",
                border: "1px solid var(--line)",
              }}
            />
          </div>
        );
      })}

      {/* status caption */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 28,
          transform: "translateX(-50%)",
          fontFamily: "var(--mono)",
          fontSize: 11,
          letterSpacing: ".18em",
          textTransform: "uppercase",
          color: "var(--ink-faint)",
        }}
      >
        {label}
      </div>
    </div>
  );
}
