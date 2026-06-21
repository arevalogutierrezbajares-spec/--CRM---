"use client";

/**
 * THE BRAIN — altitude pill (FR-NAV-4).
 *
 * The persistent "where am I in the zoom stack" indicator, centered top of the
 * canvas. Reads `view.level`/`axis`/focus from the provider and renders a
 * human-readable altitude string, e.g. "Portfolio · 5 systems · L0" or
 * "CaneyCloud · 9 domains · L1". Pure presentation — no actions.
 */

import { useBrain } from "@/components/brain/canvas/graph-provider";
import { childrenOf } from "@/lib/brain/selectors";
import { SYSTEM_LABEL, type System } from "@/lib/brain/types";

const ALTITUDE_NAME: Record<number, string> = {
  0: "Portfolio",
  1: "System",
  2: "Domain",
  3: "Surface",
};

export function AltitudePill() {
  const { graph, view } = useBrain();
  const { level, axis, focusSystemId, focusDomainId } = view;

  let title: string = ALTITUDE_NAME[level] ?? "Portfolio";
  let count = "";

  if (level === 0) {
    if (axis === "function") {
      title = "Functions";
      count = `${graph.functions.length} functions`;
    } else {
      const systems = graph.nodes.filter((n) => n.level === 1).length;
      title = "Portfolio";
      count = `${systems} systems`;
    }
  } else if (level === 1) {
    if (axis === "function" && view.focusFn) {
      const fn = graph.functions.find((f) => f.id === view.focusFn);
      title = fn?.name ?? "Function";
      count = `${fn?.members.length ?? 0} domains`;
    } else if (focusSystemId) {
      title = SYSTEM_LABEL[focusSystemId as System] ?? focusSystemId;
      const domains = childrenOf(graph, focusSystemId).filter(
        (n) => n.level === 2,
      ).length;
      count = `${domains} domains`;
    }
  } else if (level === 2 && focusDomainId) {
    const dom = graph.nodes.find((n) => n.id === focusDomainId);
    title = dom?.label ?? "Domain";
    const surfaces = childrenOf(graph, focusDomainId).filter(
      (n) => n.level === 3,
    ).length;
    count = `${surfaces} surfaces`;
  }

  return (
    <div
      className="glass-altitude"
      role="status"
      aria-live="polite"
      aria-label={`Altitude: ${title}${count ? `, ${count}` : ""}, level ${level}`}
      style={{
        position: "absolute",
        top: 14,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 13px",
        borderRadius: 20,
        border: "1px solid var(--line-2)",
        fontFamily: "var(--mono)",
        fontSize: 11,
        letterSpacing: ".2em",
        textTransform: "uppercase",
        color: "var(--ink-dim)",
        pointerEvents: "none",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ color: "var(--ink)" }}>{title}</span>
      {count && (
        <>
          <Dot />
          <span>{count}</span>
        </>
      )}
      <Dot />
      <span style={{ color: "var(--ink-faint)" }}>{`L${level}`}</span>
    </div>
  );
}

function Dot() {
  return (
    <span aria-hidden="true" style={{ color: "var(--ink-faint)", opacity: 0.5 }}>
      ·
    </span>
  );
}
