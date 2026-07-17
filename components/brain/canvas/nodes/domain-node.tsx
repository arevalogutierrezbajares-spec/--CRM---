"use client";

/**
 * THE BRAIN — Domain node (L2 chip).
 *
 * A chip carrying: status glyph (.si) + label (.t) + a secondary `.more`
 * affordance (surface count / state label). State is DOUBLE-ENCODED via the
 * data-state attribute (CSS adds the solid/dashed left-border + .si color +
 * opacity in brain.css). When the domain is a cross-system interchange endpoint
 * it gets data-xlink="1" (the ⇄ badge). The function-overlay lens recolors the
 * left-border + glyph by setting --accent to the function color (data.fnColor).
 *
 * data-* attributes the lens CSS selectors rely on:
 *   data-state="done|doing|needed"  (status double-encode)
 *   data-xlink="1"                   (cross-system link — derived from graph.edges)
 *   data-fn="<fn>"                   (function-overlay recolor target)
 *   data-live="ok|dead|atrophy"      (liveness lens, v2)
 *   data-size="sm|md|lg"             (chip padding)
 */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { STATE_GLYPH, STATE_LABEL, SYSTEM_ACCENT, type System } from "@/lib/brain/types";
import type { RFNodeData } from "@/lib/brain/lenses/types";
import { emphasisOf } from "@/lib/brain/analytics";
import { useBrain } from "@/components/brain/canvas/graph-provider";
import "./brain-nodes.css";

export default function DomainNode({ data, selected }: NodeProps) {
  const d = data as unknown as RFNodeData;
  const { graph, actions } = useBrain();
  const node = d.node;

  // Interchange endpoints store full node ids (e.g. "crm.projects"), not slugs.
  const isXlink = graph.edges.some(
    (e) =>
      e.kind === "interchange" &&
      e.contract_status === "live" &&
      (e.from.domain === node.id || e.to.domain === node.id),
  );

  const accent =
    d.lens === "function" && d.fnColor
      ? d.fnColor
      : node.system
        ? SYSTEM_ACCENT[node.system as System]
        : "var(--ext)";

  // Analytics overlay: hub (god-object) or orphan (no mapped data-flow).
  const emph = emphasisOf(node.id);

  const glyph = STATE_GLYPH[node.state];
  const surfaceCount = node.surfaces.length;
  const more =
    surfaceCount > 0
      ? `${surfaceCount} surface${surfaceCount === 1 ? "" : "s"} ▸`
      : STATE_LABEL[node.state];

  const drill = () => {
    actions.drillInto({
      nodeId: node.id,
      level: 2,
      domainId: node.id,
    });
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
      className={`nd brain-spawn${selected ? " sel" : ""}`}
      data-state={node.state}
      data-size={node.size}
      data-xlink={isXlink ? "1" : undefined}
      data-fn={d.lens === "function" && node.fn ? node.fn : undefined}
      data-live={node.liveness ?? undefined}
      data-emph={emph?.kind}
      onClick={drill}
      onKeyDown={onKeyDown}
      aria-label={`${node.label} — ${STATE_LABEL[node.state]}${
        isXlink ? ", cross-system link" : ""
      }${
        emph?.kind === "hub"
          ? `, hub (${emph.degree} links)`
          : emph?.kind === "orphan"
            ? ", blind spot — no mapped data-flow"
            : ""
      }. ${surfaceCount} surfaces.`}
      style={
        {
          // --accent drives the chip border-color on hover + selection (brain.css).
          "--accent": accent,
          // --emph-accent tints the hub marker/border (analytics overlay).
          "--emph-accent": emph?.kind === "hub" ? accent : undefined,
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
        <span className="t">{node.label}</span>
      </div>
      <span className="more">{more}</span>
    </button>
  );
}
