"use client";

/**
 * THE BRAIN — node detail panel (FR-DETAIL-1).
 *
 * The single right-side glass panel. It reads `view.selection` (a node id, an
 * interchange edge id, or a synthetic surface id `${domainId}::surface::${i}`)
 * from the provider, resolves it, and routes to the matching sub-renderer:
 *
 *   portfolio  → SelPortfolio   (L0, nothing selected)
 *   system     → SelSystem      (L0/L1 system hub)
 *   domain     → SelDomain      (L2 domain or roadmap cluster)
 *   surface    → SelSurface     (L3 surface / synthetic surface string)
 *   station    → SelStation     (interchange edge)
 *
 * The panel is an `aria-live="polite"` region: selection changes are announced
 * politely without stealing focus (FR-DETAIL-1 / NFR-A11Y-3). It never renders
 * blank — with no selection at L1/L2 it falls back to the focused context, and
 * at L0 it shows the portfolio overview (NFR-OBS-4).
 */

import { useMemo } from "react";
import { useBrain } from "@/components/brain/canvas/graph-provider";
import { isClusterNode, nodeById } from "@/lib/brain/selectors";
import type { BrainEdge, BrainGraph, BrainNode } from "@/lib/brain/types";
import { resolveSelection, type Resolved } from "./panel-utils";
import { SelPortfolio } from "./sel-portfolio";
import { SelSystem } from "./sel-system";
import { SelDomain } from "./sel-domain";
import { SelSurface, type SurfaceTarget } from "./sel-surface";
import { SelStation } from "./sel-station";
import "./panel.css";

/** Synthetic surface-string selection id parser. */
const SURFACE_RE = /^(.+)::surface::(\d+)$/;

type Routed =
  | { kind: "portfolio" }
  | { kind: "system"; node: BrainNode }
  | { kind: "domain"; node: BrainNode }
  | { kind: "surface"; target: SurfaceTarget }
  | { kind: "station"; edge: BrainEdge };

function routeSelection(
  graph: BrainGraph,
  selection: string | null,
  fallback: { focusDomainId: string | null; focusSystemId: string | null; level: number },
): Routed {
  // 1) Synthetic surface string selection (domain has no real L3 nodes in v0).
  if (selection) {
    const m = selection.match(SURFACE_RE);
    if (m) {
      const parent = nodeById(graph, m[1]);
      const idx = Number(m[2]);
      const raw = parent?.surfaces?.[idx];
      if (parent && raw != null) {
        return {
          kind: "surface",
          target: {
            raw,
            system: parent.system,
            parent,
            docsRef: parent.docs_ref,
          },
        };
      }
    }
  }

  const resolved: Resolved = resolveSelection(graph, selection);

  if (resolved.kind === "edge") {
    return { kind: "station", edge: resolved.edge };
  }

  if (resolved.kind === "node") {
    return routeNode(resolved.node);
  }

  // 2) No explicit selection → derive from altitude/focus (never blank).
  if (fallback.focusDomainId) {
    const d = nodeById(graph, fallback.focusDomainId);
    if (d) return routeNode(d);
  }
  if (fallback.focusSystemId) {
    const s = nodeById(graph, fallback.focusSystemId);
    if (s) return routeNode(s);
  }
  return { kind: "portfolio" };
}

function routeNode(node: BrainNode): Routed {
  if (isClusterNode(node)) return { kind: "domain", node };
  if (node.level <= 1) return { kind: "system", node };
  if (node.level === 2) return { kind: "domain", node };
  return {
    kind: "surface",
    target: {
      raw: node.surfaces[0] ?? node.label,
      system: node.system,
      parent: null,
      docsRef: node.docs_ref,
    },
  };
}

export function DetailPanel() {
  const { graph, view, actions } = useBrain();

  const routed = useMemo(
    () =>
      routeSelection(graph, view.selection, {
        focusDomainId: view.focusDomainId,
        focusSystemId: view.focusSystemId,
        level: view.level,
      }),
    [graph, view.selection, view.focusDomainId, view.focusSystemId, view.level],
  );

  // Accessible announcement for the live region (FR-DETAIL-1).
  const announce = announceFor(routed);

  const hasSelection = view.selection != null;

  return (
    <aside
      className="brain-detail glass-detail"
      aria-label="Selection detail"
      aria-live="polite"
      aria-atomic="true"
    >
      {/* Visually-hidden announcement so SR users hear selection changes. */}
      <span
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
        }}
      >
        {announce}
      </span>

      {hasSelection ? (
        <button
          type="button"
          className="d-close"
          aria-label="Clear selection"
          onClick={() => actions.clear()}
        >
          ✕
        </button>
      ) : null}

      {routed.kind === "portfolio" && <SelPortfolio />}
      {routed.kind === "system" && <SelSystem node={routed.node} />}
      {routed.kind === "domain" && <SelDomain node={routed.node} />}
      {routed.kind === "surface" && <SelSurface target={routed.target} />}
      {routed.kind === "station" && <SelStation edge={routed.edge} />}
    </aside>
  );
}

function announceFor(routed: Routed): string {
  switch (routed.kind) {
    case "portfolio":
      return "Portfolio overview selected.";
    case "system":
      return `System selected: ${routed.node.label}.`;
    case "domain":
      return `Domain selected: ${routed.node.label}.`;
    case "surface":
      return `Surface selected: ${routed.target.raw}.`;
    case "station":
      return `Interchange selected: ${routed.edge.from.system} to ${routed.edge.to.system}.`;
  }
}
