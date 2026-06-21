"use client";

/**
 * THE BRAIN — Spoke edge (hub→domain / domain→surface / cross-system thread).
 *
 * A bowed quadratic Bézier: the control point sits at the segment midpoint
 * lifted by 36px (`my = (y1+y2)/2 - 36`), reproducing the mockup's `spoke()`
 * recipe verbatim. Stroke color + opacity follow context:
 *   - interchange edges → health color (ok/warn/dark), dashed when dark.
 *   - contains/calls    → owning-system color, low opacity; dashed when the
 *                         target is planned/needed.
 * No arrow markers — direction is read from the panel/label glyphs, not heads.
 * Lens dimming honors data.dimmed (planned edges recede).
 */

import { type EdgeProps } from "@xyflow/react";
import { SYSTEM_ACCENT, type Health, type System } from "@/lib/brain/types";
import type { RFEdgeData } from "@/lib/brain/lenses/types";

const HEALTH_COLOR: Record<Health, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  dark: "var(--dark)",
};

export default function SpokeEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}: EdgeProps) {
  const d = data as unknown as RFEdgeData | undefined;
  const edge = d?.edge;

  // Bowed quadratic: lift the midpoint control by 36px (mockup recipe).
  const mx = (sourceX + targetX) / 2;
  const my = (sourceY + targetY) / 2 - 36;
  const path = `M ${sourceX},${sourceY} Q ${mx},${my} ${targetX},${targetY}`;

  const isInterchange = edge?.kind === "interchange";
  // Data-flow edges (route→table reads_writes, service→service calls) read as a
  // dotted thread distinct from the solid structural contains spokes — so "this
  // route writes these tables" is legible at a glance, not just another spoke.
  const isDataFlow = edge?.kind === "reads_writes" || edge?.kind === "calls";
  const isPlanned = edge?.contract_status === "planned";
  const health = (edge?.health ?? "ok") as Health;

  // Color: interchange → health; data-flow → caney (cool data tint); spoke →
  // owning-system accent.
  const stroke = isInterchange
    ? HEALTH_COLOR[health]
    : isDataFlow
      ? "var(--caney)"
      : edge?.from?.system
        ? SYSTEM_ACCENT[edge.from.system as System]
        : "var(--ink-faint)";

  // Opacity: bumped for legibility — the prior 0.3 spoke read as a barely-there
  // hairline. Planned/dimmed still recede but stay perceptible so the
  // hub-and-spoke fan is always readable when you drill in.
  let opacity = isInterchange ? 0.6 : isDataFlow ? 0.5 : 0.46;
  if (isPlanned || d?.dimmed) opacity = isInterchange ? 0.32 : 0.24;
  if (selected) opacity = Math.min(1, opacity + 0.35);

  // Dashed when planned, dark health, the lens recedes it, OR it's a data-flow
  // edge (dotted thread).
  const dashed = isPlanned || health === "dark" || d?.dimmed || isDataFlow;
  const dash = isDataFlow ? "1 5" : dashed ? (isInterchange ? "7 7" : "4 6") : undefined;

  return (
    <path
      id={id}
      d={path}
      fill="none"
      stroke={stroke}
      strokeWidth={2}
      strokeOpacity={opacity}
      strokeDasharray={dash}
      strokeLinecap="round"
      className="react-flow__edge-path"
      style={{ transition: "stroke-opacity .2s var(--ease)" }}
    />
  );
}
