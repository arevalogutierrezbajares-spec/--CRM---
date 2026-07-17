"use client";

/**
 * THE BRAIN — back / zoom-out button (FR-NAV-2).
 *
 * Top-left canvas affordance. One of the 3 up-paths (the other two are the
 * breadcrumb crumbs and the Esc key). Hidden at L0 (nothing to pop), fades in
 * past portfolio. Pops exactly one altitude via the provider's `goUp()`.
 *
 * Esc-to-zoom-out is owned by the canvas shell, not here, to avoid duplicate
 * global listeners; this component only exposes the visible control + label.
 */

import { useBrain } from "@/components/brain/canvas/graph-provider";

export function BackButton() {
  const { view, actions } = useBrain();
  const visible = view.level > 0;

  return (
    <button
      type="button"
      onClick={() => actions.goUp()}
      aria-label="Zoom out one level"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className="glass-back"
      style={{
        position: "absolute",
        top: 14,
        left: 14,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        gap: 8,
        minHeight: 36,
        padding: "6px 14px",
        borderRadius: 20,
        border: "1px solid var(--line-2)",
        fontFamily: "var(--mono)",
        fontSize: 11,
        letterSpacing: ".12em",
        textTransform: "uppercase",
        color: "var(--ink-dim)",
        cursor: visible ? "pointer" : "default",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        boxShadow: "var(--shadow-low), var(--gleam)",
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 12 }}>
        ←
      </span>
      <span>zoom out</span>
      <kbd
        style={{
          fontFamily: "var(--mono)",
          fontSize: 10,
          padding: "1px 5px",
          borderRadius: 5,
          border: "1px solid var(--line-2)",
          color: "var(--ink-faint)",
        }}
      >
        esc
      </kbd>
    </button>
  );
}
