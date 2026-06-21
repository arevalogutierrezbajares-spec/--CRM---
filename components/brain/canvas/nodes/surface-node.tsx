"use client";

/**
 * THE BRAIN — Surface node (L3 chip).
 *
 * The leaf: a single route/file surface. Renders as `[METHOD] /path | LANG`.
 * The HTTP method (if present) is a small bordered badge tinted --caney; the
 * path is mono; a trailing lang/source badge (TS / PY / SQL / UI) is inferred
 * from the path shape + node.source. Surfaces are terminal — clicking selects
 * (opens the detail panel) rather than drilling deeper.
 *
 * data-* attributes carried for the lens CSS (liveness dims data-live="dead").
 */

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { NodeSource } from "@/lib/brain/types";
import type { RFNodeData } from "@/lib/brain/lenses/types";
import { useBrain } from "../graph-provider";
import "./brain-nodes.css";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/** Split a surface label into an optional HTTP method + the path. */
function parseSurface(label: string): { method: string | null; path: string } {
  const trimmed = label.trim();
  // Handle combined methods like "GET/POST /admin/x".
  const sp = trimmed.indexOf(" ");
  if (sp > 0) {
    const head = trimmed.slice(0, sp);
    const parts = head.split("/");
    if (parts.every((p) => HTTP_METHODS.includes(p))) {
      return { method: head, path: trimmed.slice(sp + 1) };
    }
  }
  return { method: null, path: trimmed };
}

/** Infer a short language/source badge for the surface. */
function langFor(path: string, source: NodeSource): string {
  if (/\(planned\)/i.test(path) || source === "manifest") return "DOC";
  if (path.startsWith("/app") || path.includes("(")) return "UI";
  if (/\.py(\b|$)/.test(path) || source === "migrations") {
    return source === "migrations" ? "SQL" : "PY";
  }
  if (/\.ts(x)?(\b|$)/.test(path)) return "TS";
  if (path.startsWith("/api") || path.startsWith("/")) return "API";
  return "TS";
}

export default function SurfaceNode({ data, selected }: NodeProps) {
  const d = data as unknown as RFNodeData;
  const { actions } = useBrain();
  const node = d.node;

  const { method, path } = parseSurface(node.label);
  const lang = langFor(path, node.source);

  const onActivate = () => actions.select(node.id);
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate();
    }
  };

  return (
    <button
      type="button"
      className={`surface brain-spawn${selected ? " sel" : ""}`}
      data-state={node.state}
      data-size={node.size}
      data-live={node.liveness ?? undefined}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      aria-label={`Surface ${method ? `${method} ` : ""}${path} (${lang})`}
      style={
        {
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

      <div className="chip" data-kind={node.source === "migrations" ? "entity" : "route"}>
        {node.source === "migrations" ? (
          // Data store (DB table) — a leading glyph + caney accent makes tables
          // read distinctly from route surfaces, so the route→table data-flow
          // story is legible at a glance.
          <span className="store" aria-hidden="true">
            ▤
          </span>
        ) : method ? (
          <span className="method" aria-hidden="true">
            {method}
          </span>
        ) : null}
        <span className="path">{path}</span>
        <span className="lang" aria-hidden="true">
          {lang}
        </span>
      </div>
    </button>
  );
}
