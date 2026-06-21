"use client";

/**
 * THE BRAIN — empty state (NFR-OBS-4: never a blank screen).
 *
 * Shown when a view resolves to zero nodes (e.g. a function with no members, or
 * a graph that loaded but is genuinely empty). Honors the mockup's "safe to
 * build it" framing — an empty region is an invitation, not an error. Optional
 * action lets the caller wire a reset/zoom-out.
 */

import type { ReactNode } from "react";

export function EmptyState({
  title = "Nothing mapped here yet",
  hint = "This region resolves to zero nodes — safe to build it.",
  icon = "○",
  action,
}: {
  title?: string;
  hint?: string;
  icon?: ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div
      className="brain-root"
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          maxWidth: 340,
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            border: "2px dashed var(--line-2)",
            color: "var(--ink-faint)",
            fontSize: 26,
            fontFamily: "var(--mono)",
          }}
        >
          {icon}
        </div>

        <div
          style={{
            fontFamily: "var(--disp)",
            fontWeight: 600,
            fontSize: 16,
            letterSpacing: "-.01em",
            color: "var(--ink)",
          }}
        >
          {title}
        </div>

        <p
          style={{
            margin: 0,
            fontSize: 12.5,
            lineHeight: 1.55,
            color: "var(--ink-dim)",
          }}
        >
          {hint}
        </p>

        {action && (
          <button
            type="button"
            onClick={action.onClick}
            style={{
              marginTop: 4,
              fontFamily: "var(--mono)",
              fontSize: 11,
              letterSpacing: ".03em",
              textTransform: "uppercase",
              color: "var(--ink)",
              background: "var(--panel-s)",
              border: "1px solid var(--line-2)",
              borderRadius: 9,
              padding: "7px 13px",
              cursor: "pointer",
              boxShadow: "var(--shadow-low), var(--gleam)",
            }}
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
