"use client";

/**
 * THE BRAIN — Hub node (L0 portfolio + L1 system hubs).
 *
 * The signature node: a gleam orb wrapping a conic progress ring (percent built),
 * the system/function accent, a tabular-nums percentage, the system name, and a
 * mono meta readout. State is DOUBLE-ENCODED (NFR-A11Y-1): color + glyph + text
 * label + a solid/dashed left accent bar — never color alone.
 *
 * Receives the RFNodeData contract from the active lens (graph-provider →
 * lens reducer). Enter/Space drills via the provider; the wrapper is a real
 * <button> so it is keyboard-reachable and carries the global focus ring.
 *
 * CSS lives verbatim in brain.css (`.hub .orb` / `.orb::before` carve the donut).
 * No neon glow (NFR-A11Y-6): elevation comes from --shadow-* + --gleam only.
 */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  STATE_GLYPH,
  STATE_LABEL,
  SYSTEM_ACCENT,
  type Fn,
  type System,
} from "@/lib/brain/types";
import "./brain-nodes.css";
import { FN_COLOR } from "@/lib/brain/functions";
import type { RFNodeData } from "@/lib/brain/lenses/types";
import { useBrain } from "../graph-provider";

/** Percent-built for a hub: weighted mean of children, surfaced via node.pos hints. */
function hubPercent(data: RFNodeData): number {
  // The lens may carry a precomputed pct on meta; otherwise derive from state.
  // Hubs always render a ring — state maps to a sensible default fill.
  const n = data.node;
  if (typeof (n as unknown as { pct?: number }).pct === "number") {
    return Math.max(0, Math.min(100, (n as unknown as { pct: number }).pct));
  }
  switch (n.state) {
    case "done":
      return 100;
    case "doing":
      return 55;
    default:
      return 12;
  }
}

export default function HubNode({ data, selected }: NodeProps) {
  const d = data as unknown as RFNodeData;
  const { actions, view } = useBrain();
  const node = d.node;

  const isFnLens = d.lens === "function";
  const accent =
    isFnLens && d.fnColor
      ? d.fnColor
      : node.system
        ? SYSTEM_ACCENT[node.system as System]
        : FN_COLOR[(node.fn ?? "platform") as Fn];

  const pct = hubPercent(d);
  const glyph = STATE_GLYPH[node.state];
  const label = STATE_LABEL[node.state];
  const isCenter = view.focusSystemId === node.id && view.level >= 1;

  const drill = () => {
    // By-Function axis root → drill into a function (its member domains across
    // all systems). Otherwise L0 → L1: drill from a system hub into the system.
    if (view.axis === "function" && view.level === 0) {
      actions.drillInto({
        nodeId: node.id,
        level: 1,
        fn: (node.fn as Fn) ?? null,
      });
    } else {
      actions.drillInto({
        nodeId: node.id,
        level: 1,
        system: (node.system as System) ?? null,
      });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      drill();
    }
  };

  return (
    <button
      type="button"
      className={`hub brain-spawn${isCenter ? " center" : ""}${
        selected ? " sel" : ""
      }`}
      data-state={node.state}
      data-size={node.size}
      data-live={node.liveness ?? undefined}
      onClick={drill}
      onKeyDown={onKeyDown}
      aria-label={`${node.label} — ${label}, ${pct}% built. Drill in.`}
      style={
        {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 7,
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          opacity: d.emphasis,
          transition: "opacity .2s var(--ease)",
        } as React.CSSProperties
      }
    >
      {/* Hidden handles keep React Flow's edge anchoring happy; visually removed. */}
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} isConnectable={false} />

      <div
        className="orb"
        style={
          {
            "--p": pct,
            "--accent": accent,
            // Scale orb by size so large systems read visually larger (#7).
            "--orb-scale":
              node.size === "lg" ? "1.15" : node.size === "sm" ? "0.85" : "1",
            width: `calc(${isCenter ? 120 : 104}px * ${
              node.size === "lg" ? 1.15 : node.size === "sm" ? 0.85 : 1
            })`,
            height: `calc(${isCenter ? 120 : 104}px * ${
              node.size === "lg" ? 1.15 : node.size === "sm" ? 0.85 : 1
            })`,
          } as React.CSSProperties
        }
      >
        <span
          className="pct"
          style={{
            fontFamily: "var(--disp)",
            fontWeight: 700,
            fontSize: isCenter ? 20 : 21,
            letterSpacing: "-.02em",
            fontVariantNumeric: "tabular-nums",
            color: "var(--ink)",
          }}
        >
          {pct}
          <small style={{ fontSize: 11, color: "var(--ink-dim)" }}>%</small>
        </span>
      </div>

      <span
        className="name"
        style={{
          fontFamily: "var(--disp)",
          fontWeight: 600,
          fontSize: 15,
          letterSpacing: "-.01em",
          color: "var(--ink)",
          /* double-encode: a solid (built/wip) vs dashed (needed) accent bar. */
          borderLeft:
            node.state === "needed"
              ? `3px dashed ${accent}`
              : `3px solid ${accent}`,
          paddingLeft: 8,
          lineHeight: 1.1,
        }}
      >
        {node.label}
      </span>

      {/* State chip: glyph + text label (survives grayscale). */}
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 11,
          letterSpacing: ".10em",
          textTransform: "uppercase",
          color:
            node.state === "done"
              ? "var(--done)"
              : node.state === "doing"
                ? "var(--doing)"
                : "var(--needed)",
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        <span aria-hidden="true">{glyph}</span>
        {label}
      </span>

      {node.meta ? (
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--ink-faint)",
            maxWidth: 168,
            textAlign: "center",
            lineHeight: 1.35,
          }}
        >
          {node.meta}
        </span>
      ) : null}
    </button>
  );
}
