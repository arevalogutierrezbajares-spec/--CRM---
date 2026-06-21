"use client";

/**
 * THE BRAIN — first-run coachmark.
 *
 * A one-time, localStorage-gated hint naming the two core interactions (drill,
 * zoom) + the way out. Without it a first-time viewer lands on a constellation
 * of ring-gauges with no on-canvas instruction (the pitch / first-contact gap).
 * Shows once, then never again; dismissable; SSR-safe.
 */

import { useState } from "react";

const SEEN_KEY = "brain.coachmark.v1";

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
        bottom: 20,
        transform: "translateX(-50%)",
        zIndex: 22,
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
        <b style={{ color: "var(--ink)" }}>Click a node</b> to drill in ·{" "}
        <b style={{ color: "var(--ink)" }}>pinch</b> or use the + / − controls to
        zoom · <b style={{ color: "var(--ink)" }}>Esc</b> to go back
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
