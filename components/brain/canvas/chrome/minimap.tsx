"use client";

/**
 * THE BRAIN — minimap / "you are here" (FR-NAV-5).
 *
 * Persistent bottom-left orientation widget. Renders a compact portfolio
 * silhouette (one dot per system, positioned on the same ring the canvas uses)
 * and fills the dot for whichever system you're currently inside, so altitude
 * never disorients. Self-contained (reads only the provider) so it stays
 * mounted across every level — it does not depend on the React Flow viewport.
 *
 * Each dot is also a jump target: click to drill into that system (L1).
 */

import { useBrain } from "@/components/brain/canvas/graph-provider";
import { SYSTEM_ACCENT, SYSTEM_LABEL, type System } from "@/lib/brain/types";

const W = 128;
const MAP_H = 58;

/** Same deterministic ring the portfolio uses, normalized into the map box. */
function ringPoint(i: number, n: number) {
  const angle = (-90 + i * (360 / n)) * (Math.PI / 180);
  const r = 0.34; // fraction of the box half-extent
  return {
    cx: 0.5 + r * Math.cos(angle),
    cy: 0.5 + r * Math.sin(angle),
  };
}

export function Minimap() {
  const { graph, view, actions } = useBrain();

  const systems = graph.nodes
    .filter((n) => n.level === 1 && n.system)
    .map((n) => n.system as System);

  const here =
    view.focusSystemId ??
    (view.focusDomainId
      ? (graph.nodes.find((n) => n.id === view.focusDomainId)?.system ?? null)
      : null);

  return (
    <div
      className="glass-minimap"
      aria-label="Minimap: you are here"
      style={{
        position: "absolute",
        left: 14,
        bottom: 14,
        zIndex: 18,
        width: W,
        padding: 7,
        borderRadius: 12,
        border: "1px solid var(--line-2)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 11,
          letterSpacing: ".16em",
          textTransform: "uppercase",
          color: "var(--ink-faint)",
        }}
      >
        You are here
      </div>

      <div style={{ position: "relative", width: "100%", height: MAP_H }}>
        {systems.map((sys, i) => {
          const p = ringPoint(i, systems.length);
          const isHere = sys === here;
          const accent = SYSTEM_ACCENT[sys];
          return (
            <button
              key={sys}
              type="button"
              title={SYSTEM_LABEL[sys]}
              aria-label={`${SYSTEM_LABEL[sys]}${isHere ? " (current)" : ""}`}
              aria-current={isHere ? "true" : undefined}
              onClick={() =>
                actions.drillInto({ nodeId: sys, level: 1, system: sys })
              }
              style={{
                // 24px transparent hit-area (a11y-05) with an 11px visual dot
                // centered inside — touch-friendly without crowding the map.
                position: "absolute",
                left: `${p.cx * 100}%`,
                top: `${p.cy * 100}%`,
                transform: "translate(-50%,-50%)",
                width: 24,
                height: 24,
                borderRadius: "50%",
                border: "none",
                background: "transparent",
                display: "grid",
                placeItems: "center",
                padding: 0,
                cursor: "pointer",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: "50%",
                  border: `1.5px solid ${accent}`,
                  background: isHere ? accent : "transparent",
                  boxShadow: isHere ? "var(--shadow-low)" : "none",
                }}
              />
            </button>
          );
        })}
      </div>

      {here && (
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--ink-dim)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {SYSTEM_LABEL[here]}
        </div>
      )}
    </div>
  );
}
