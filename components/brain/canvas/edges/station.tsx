"use client";

/**
 * THE BRAIN — Interchange station (L0 only).
 *
 * The subway-station pin: a LIVE cross-system interchange edge, drawn as a bowed
 * connector (same -36px control bow as the spoke) with a health-coded square pin
 * pinned at the curve apex. Health is DOUBLE-ENCODED (NFR-A11Y-1): color + glyph
 * (✓ / ! / ·) + a solid-vs-dashed pin border — never color alone — using
 * HEALTH_GLYPH / HEALTH_LABEL from types.ts. The purpose surfaces in a glass
 * tooltip on hover/selection. No neon glow (NFR-A11Y-6).
 *
 * Selecting the station opens the detail panel via actions.select(edge.id).
 * The pin is keyboard-reachable; Enter/Space selects.
 */

import { EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import {
  HEALTH_GLYPH,
  HEALTH_LABEL,
  SYSTEM_LABEL,
  type Health,
  type System,
} from "@/lib/brain/types";
import type { RFEdgeData } from "@/lib/brain/lenses/types";
import { useBrain } from "../graph-provider";
import "./brain-edges.css";

const HEALTH_COLOR: Record<Health, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  dark: "var(--dark)",
};

export default function StationEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}: EdgeProps) {
  const d = data as unknown as RFEdgeData | undefined;
  const { actions, view } = useBrain();
  const edge = d?.edge;

  // Bowed quadratic — control point lifted 36px (mockup recipe).
  const cx = (sourceX + targetX) / 2;
  const cy = (sourceY + targetY) / 2 - 36;
  const path = `M ${sourceX},${sourceY} Q ${cx},${cy} ${targetX},${targetY}`;

  // Point on the quadratic at t=0.5 = the curve apex (where the pin sits).
  const px = 0.25 * sourceX + 0.5 * cx + 0.25 * targetX;
  const py = 0.25 * sourceY + 0.5 * cy + 0.25 * targetY;

  const health = (edge?.health ?? "ok") as Health;
  const stroke = HEALTH_COLOR[health];
  const glyph = HEALTH_GLYPH[health];
  const isSelected = selected || view.selection === id;

  const fromLabel = edge ? SYSTEM_LABEL[edge.from.system as System] : "";
  const toLabel = edge ? SYSTEM_LABEL[edge.to.system as System] : "";

  const onSelect = () => actions.select(id);
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <>
      <path
        id={id}
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeOpacity={isSelected ? 0.85 : 0.5}
        strokeDasharray={health === "dark" ? "7 7" : "4 10"}
        strokeLinecap="round"
        className="react-flow__edge-path"
        style={{
          transition: "stroke-opacity .2s var(--ease)",
          animation:
            health === "dark" ? "none" : "brain-flow 1.8s linear infinite",
        }}
      />

      <EdgeLabelRenderer>
        <div
          className={`station${isSelected ? " sel" : ""}${health === "dark" ? " dark" : ""}`}
          data-health={health}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${px}px, ${py}px)`,
            pointerEvents: "all",
          }}
        >
          <button
            type="button"
            className="pin nodrag nopan brain-spawn"
            onClick={onSelect}
            onKeyDown={onKeyDown}
            aria-label={`Interchange ${fromLabel} → ${toLabel}: ${
              edge?.purpose ?? "cross-system link"
            } — ${HEALTH_LABEL[health]}`}
          >
            <span aria-hidden="true">{glyph}</span>
          </button>

          <span className="lbl glass-thread" role="tooltip">
            <b>
              {fromLabel} → {toLabel}
            </b>
            <span className="hp">{HEALTH_LABEL[health]}</span>
            {edge?.purpose ? <span className="pp">{edge.purpose}</span> : null}
          </span>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
