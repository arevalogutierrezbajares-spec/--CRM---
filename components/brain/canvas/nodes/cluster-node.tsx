"use client";

/**
 * THE BRAIN — Cluster node (collapsed roadmap, FR-NAV-7).
 *
 * When a system has ≥2 `needed` sibling domains they collapse into one hatched,
 * dashed "Roadmap · N needed ▸" node so the roadmap stays visible but recessive.
 * Clicking (or Enter/Space) pops it open via actions.expandCluster — the lens
 * then re-derives with the members spread back out.
 *
 * The synthetic id is `${parentId}.__roadmap`; clusterMembers carries the real
 * ids. State is fixed "needed" (dashed + dimmed double-encode in brain-nodes.css
 * via .nd.cluster + data-state="needed").
 */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { STATE_GLYPH } from "@/lib/brain/types";
import type { RFNodeData } from "@/lib/brain/lenses/types";
import { isClusterNode } from "@/lib/brain/selectors";
import { useBrain } from "../graph-provider";
import "./brain-nodes.css";

export default function ClusterNode({ data, selected }: NodeProps) {
  const d = data as unknown as RFNodeData;
  const { actions } = useBrain();
  const node = d.node;

  const memberCount = isClusterNode(node) ? node.clusterMembers.length : 0;
  const glyph = STATE_GLYPH.needed;

  const expand = () => actions.expandCluster(node.id);
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      expand();
    }
  };

  return (
    <button
      type="button"
      className={`nd cluster brain-spawn${selected ? " sel" : ""}`}
      data-state="needed"
      data-size="md"
      aria-label={`Roadmap — ${memberCount} needed. Expand.`}
      aria-expanded={false}
      onClick={expand}
      onKeyDown={onKeyDown}
      style={
        {
          "--accent": "var(--needed)",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 5,
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          opacity: d.emphasis,
          transition: "opacity .2s var(--ease)",
        } as React.CSSProperties
      }
    >
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} isConnectable={false} />

      <div className="chip">
        <span className="si" aria-hidden="true">
          {glyph}
        </span>
        <span className="t">Roadmap</span>
      </div>
      <span className="more">{memberCount} needed ▸</span>
    </button>
  );
}
