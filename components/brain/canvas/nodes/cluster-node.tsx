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
  const { actions, graph, view } = useBrain();
  const node = d.node;

  const kind = isClusterNode(node) ? (node.clusterKind ?? "roadmap") : "roadmap";
  const memberCount = isClusterNode(node) ? node.clusterMembers.length : 0;
  const isPortal = kind === "portal";
  const isOverflow = kind === "overflow";

  const title = isPortal
    ? node.label
    : isOverflow
      ? "More"
      : "Roadmap";
  const sub = isPortal
    ? "open interchange"
    : isOverflow
      ? `${memberCount} hidden ▸`
      : `${memberCount} needed ▸`;
  const glyph = isPortal ? "↗" : isOverflow ? "…" : STATE_GLYPH.needed;
  const accent = isPortal
    ? "var(--caney)"
    : isOverflow
      ? "var(--doing)"
      : "var(--needed)";
  const dataState = isPortal ? "doing" : isOverflow ? "doing" : "needed";

  const activate = () => {
    if (isPortal && isClusterNode(node) && node.portalSystem) {
      // Open the interchange detail for the live edge to the remote system.
      const focus = view.focusSystemId;
      const remote = node.portalSystem;
      const edge = graph.edges.find(
        (e) =>
          e.kind === "interchange" &&
          e.contract_status === "live" &&
          ((e.from.system === focus && e.to.system === remote) ||
            (e.to.system === focus && e.from.system === remote)),
      );
      actions.select(edge?.id ?? node.id);
      return;
    }
    actions.expandCluster(node.id);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  };

  return (
    <button
      type="button"
      className={`nd cluster brain-spawn${selected ? " sel" : ""}${isPortal ? " portal" : ""}`}
      data-state={dataState}
      data-size="md"
      data-cluster={kind}
      aria-label={
        isPortal
          ? `${node.label} — cross-system portal`
          : isOverflow
            ? `Show ${memberCount} more surfaces`
            : `Roadmap — ${memberCount} needed. Expand.`
      }
      aria-expanded={false}
      onClick={activate}
      onKeyDown={onKeyDown}
      style={
        {
          "--accent": accent,
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
        <span className="t">{title}</span>
      </div>
      <span className="more">{sub}</span>
    </button>
  );
}
