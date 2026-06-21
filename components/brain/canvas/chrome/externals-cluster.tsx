"use client";

/**
 * THE BRAIN — externals cluster (L0-only).
 *
 * Top-right chip cluster listing the external dependencies the portfolio leans
 * on (Stripe, Anthropic, WhatsApp, Mapbox, SiteMinder, Inngest, Resend, PostHog,
 * Sentry). Sourced from `graph.externals`. These are not navigable nodes — they
 * sit outside the territory boundary as context. Hidden when level ≠ 0.
 */

import { useBrain } from "@/components/brain/canvas/graph-provider";

export function ExternalsCluster() {
  const { graph, view } = useBrain();
  if (view.level !== 0) return null;
  if (!graph.externals.length) return null;

  return (
    <div
      aria-label="External dependencies"
      style={{
        position: "absolute",
        top: 14,
        right: 14,
        zIndex: 15,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "flex-end",
        gap: 6,
        maxWidth: 320,
        transition: "opacity .35s var(--ease)",
      }}
    >
      <span
        style={{
          width: "100%",
          textAlign: "right",
          fontFamily: "var(--mono)",
          fontSize: 11,
          letterSpacing: ".16em",
          textTransform: "uppercase",
          color: "var(--ink-faint)",
          marginBottom: 2,
        }}
      >
        External services
      </span>
      {graph.externals.map((name) => (
        <span
          key={name}
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--ext)",
            background: "rgba(255,255,255,.03)",
            border: "1px solid var(--line)",
            borderRadius: 7,
            padding: "3px 8px",
            boxShadow: "var(--gleam)",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </span>
      ))}
    </div>
  );
}
