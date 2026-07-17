"use client";

/**
 * THE BRAIN — first-run coachmark (search-first).
 *
 * One-time, localStorage-gated hint that names the primary habit (search the
 * portfolio before building), how to query, and the way out. Sits above the
 * L0 rebuild-guard dock (bottom offset) and below it in z-order so the dock
 * stays the hero. Shows once per version key, then never again; dismissable;
 * SSR-safe.
 */

import { useState } from "react";

/** Bump when copy/placement changes so prior dismissals don't hide the new tip. */
const SEEN_KEY = "brain.coachmark.v2";

/** Whether the hint hasn't been dismissed yet. Read once at mount — the canvas
 * is client-only (next/dynamic ssr:false) so `window` is available and there is
 * no hydration to mismatch. */
function unseen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !localStorage.getItem(SEEN_KEY);
  } catch {
    return false;
  }
}

export function Coachmark() {
  const [show, setShow] = useState(unseen);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* non-fatal */
    }
    setShow(false);
  };

  return (
    <div
      className="glass-detail brain-coach"
      role="status"
      style={{
        position: "absolute",
        left: "50%",
        /* Sit above the L0 rebuild-guard dock so it doesn't cover search forever. */
        bottom: 200,
        transform: "translateX(-50%)",
        /* Below rebuild-guard / command surfaces; above canvas chrome only. */
        zIndex: 7,
        display: "flex",
        alignItems: "center",
        gap: 12,
        maxWidth: "min(640px, 90%)",
        padding: "9px 9px 9px 14px",
        borderRadius: 11,
        border: "1px solid var(--line-2)",
        fontFamily: "var(--mono)",
        fontSize: "var(--t-data)",
        color: "var(--ink-dim)",
      }}
    >
      <span>
        <b style={{ color: "var(--ink)" }}>Search before you build</b>
        {" · "}
        type a route or wire
        {" · "}
        <b style={{ color: "var(--ink)" }}>Esc</b> goes back
      </span>
      <button
        type="button"
        onClick={dismiss}
        style={{
          flexShrink: 0,
          fontFamily: "var(--mono)",
          fontSize: "var(--t-data)",
          letterSpacing: ".04em",
          textTransform: "uppercase",
          color: "#06121a",
          background: "var(--caney)",
          border: "1px solid transparent",
          borderRadius: 8,
          padding: "6px 12px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Got it
      </button>
    </div>
  );
}
