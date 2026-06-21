"use client";

/**
 * THE BRAIN — canvas shell (the assembled React Flow surface).
 *
 * Maps the active BrainGraph (lib/brain/data/graph.ts) through the active lens
 * reducer + selectors into React-Flow-ready nodes/edges, registers the custom
 * node/edge components (hub/domain/surface/cluster · spoke/station), and frames
 * the canvas with the rail, breadcrumb, altitude pill, back button, minimap,
 * externals cluster, detail panel, command palette, and empty/loading/error
 * states.
 *
 * State lives entirely in <GraphProvider> (graph-provider.tsx) — this component
 * reads `view` and re-derives the visible graph synchronously on every change
 * (NFR-PERF-2: navigation/lens/axis/preset never refetch). Drill choreography is
 * a framer-motion spring layered over React Flow's own fitView; the THREE
 * up-paths (back button, breadcrumb crumbs, Esc key) all route through the
 * provider's goUp(). Reduced-motion is honored by the CSS (brain.css disables
 * brain-spawn/brain-zoom under prefers-reduced-motion) and by gating the spring.
 */

import "@xyflow/react/dist/style.css";
import "./brain.css";

import { useCallback, useEffect, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import { motion, useReducedMotion } from "framer-motion";

import { graph as defaultGraph } from "@/lib/brain/data/graph";
import { loadPins, savePins } from "@/lib/brain/layout/pin";
import type { BrainGraph } from "@/lib/brain/types";
import type { VisibleQuery } from "@/lib/brain/selectors";
import type { LensKey, LensResult, RFEdge, RFNode } from "@/lib/brain/lenses/types";
import { navigationLens } from "@/lib/brain/lenses/navigation";
import { stateLens } from "@/lib/brain/lenses/state";
import { functionOverlayLens } from "@/lib/brain/lenses/functionOverlay";
import { topologyLens } from "@/lib/brain/lenses/topology";
import { livenessLens } from "@/lib/brain/lenses/liveness";

import {
  GraphProvider,
  useBrain,
  type BrainView,
} from "./graph-provider";
import type { PresetId } from "@/lib/brain/presets";

import HubNode from "./nodes/hub-node";
import DomainNode from "./nodes/domain-node";
import SurfaceNode from "./nodes/surface-node";
import ClusterNode from "./nodes/cluster-node";
import SpokeEdge from "./edges/spoke-edge";
import StationEdge from "./edges/station";

import { Rail } from "./chrome/rail";
import { Breadcrumb } from "./chrome/breadcrumb";
import { AltitudePill } from "./chrome/altitude-pill";
import { BackButton } from "./chrome/back-button";
import { Minimap } from "./chrome/minimap";
import { ExternalsCluster } from "./chrome/externals-cluster";
import { BrainCommandPalette } from "./chrome/command-palette";
import { DetailPanel } from "./panel/detail-panel";
import { EmptyState } from "./states/empty-state";

/* ── Custom component registries (stable identities) ─────────────────────── */

const nodeTypes: NodeTypes = {
  hub: HubNode,
  domain: DomainNode,
  surface: SurfaceNode,
  cluster: ClusterNode,
};

const edgeTypes: EdgeTypes = {
  spoke: SpokeEdge,
  station: StationEdge,
};

/* ── Lens dispatch ───────────────────────────────────────────────────────── */

const LENS_FN: Record<LensKey, (g: BrainGraph, q: VisibleQuery) => LensResult> = {
  navigation: navigationLens,
  state: stateLens,
  function: functionOverlayLens,
  topology: topologyLens,
  liveness: livenessLens,
};

/** Build the VisibleQuery the selectors/lenses consume from the current view. */
function queryFor(view: BrainView): VisibleQuery {
  return {
    level: view.level,
    axis: view.axis,
    focusSystemId: view.focusSystemId,
    focusFn: (view.focusFn as VisibleQuery["focusFn"]) ?? null,
    focusDomainId: view.focusDomainId,
    expandedClusters: view.expandedClusters,
  };
}

/* ── Floating breadcrumb (the Breadcrumb is a plain nav — position it) ────── */

function FloatingBreadcrumb() {
  return (
    <div
      style={{
        position: "absolute",
        top: 52,
        left: 14,
        zIndex: 19,
        maxWidth: "min(60%, 520px)",
      }}
    >
      <Breadcrumb />
    </div>
  );
}

/* ── Inner canvas (inside the provider) ──────────────────────────────────── */

function CanvasInner() {
  const { graph, view, actions } = useBrain();
  const reduceMotion = useReducedMotion();

  // Load persisted pin positions from localStorage once on mount (client-only).
  // Uses seed semantics: authored pos already seeded from the graph wins;
  // persisted positions fill in nodes not yet seeded. Save on unload so
  // positions survive across sessions.
  useEffect(() => {
    loadPins();
    const flush = () => savePins();
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

  // Re-derive the visible graph through the active lens. Pure + synchronous —
  // memoized so React Flow only re-renders when an input actually changes.
  const { nodes, edges, isEmpty } = useMemo(() => {
    const lens = LENS_FN[view.lens] ?? navigationLens;
    const result = lens(graph, queryFor(view));

    const rawNodes = result.nodes as RFNode[];

    // Center the bounding box on the origin so no axis/level has a left/top
    // bias regardless of the pinned coordinates in the graph data (Fix #6b).
    let centeredNodes = rawNodes;
    if (rawNodes.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of rawNodes) {
        if (n.position.x < minX) minX = n.position.x;
        if (n.position.y < minY) minY = n.position.y;
        if (n.position.x > maxX) maxX = n.position.x;
        if (n.position.y > maxY) maxY = n.position.y;
      }
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      if (cx !== 0 || cy !== 0) {
        centeredNodes = rawNodes.map((n) => ({
          ...n,
          position: { x: n.position.x - cx, y: n.position.y - cy },
        }));
      }
    }

    const rfNodes = centeredNodes.map<Node>((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data as unknown as Record<string, unknown>,
      // Reflect provider selection so the custom components light up.
      selected: view.selection === n.id,
      draggable: false,
      connectable: false,
      // L0 function axis renders the function capability set, not BrainNodes.
    }));

    const rfEdges = (result.edges as RFEdge[]).map<Edge>((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type,
      data: e.data as unknown as Record<string, unknown>,
      selectable: e.type === "station",
      selected: view.selection === e.id,
    }));

    return { nodes: rfNodes, edges: rfEdges, isEmpty: rfNodes.length === 0 };
  }, [graph, view]);

  // Esc = one of the 3 up-paths (back button + breadcrumb are the other two).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (view.selection != null) {
          actions.clear();
        } else if (view.level > 0) {
          actions.goUp();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions, view.selection, view.level]);

  // Clicking the canvas background clears the current selection.
  const onPaneClick = useCallback(() => {
    if (view.selection != null) actions.clear();
  }, [actions, view.selection]);

  // Zoom choreography key — re-mounts the motion wrapper on altitude/focus
  // change so the spring re-plays from the new altitude (FR-NAV-6).
  const choreoKey = `${view.axis}:${view.level}:${view.focusSystemId ?? ""}:${
    view.focusFn ?? ""
  }:${view.focusDomainId ?? ""}:${view.lens}`;

  return (
    <div
      className="brain-root"
      role="application"
      aria-label="The Brain — architecture map"
      style={{
        position: "relative",
        display: "flex",
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        background: "var(--bg)",
        color: "var(--ink)",
        overflow: "hidden",
      }}
    >
      <Rail />

      <div
        aria-label="Architecture graph"
        style={{ position: "relative", flex: 1, minWidth: 0, minHeight: 0 }}
      >
        <motion.div
          key={choreoKey}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: "spring", duration: 0.5, bounce: 0.15 }
          }
          style={{ position: "absolute", inset: 0 }}
        >
          <ReactFlow
            colorMode="dark"
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onPaneClick={onPaneClick}
            fitView
            fitViewOptions={{ padding: 0.14, maxZoom: 1.45 }}
            minZoom={0.2}
            maxZoom={1.6}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            disableKeyboardA11y
            elementsSelectable
            panOnScroll
            zoomOnDoubleClick={false}
          >
            <Background variant={BackgroundVariant.Dots} gap={42} size={1} />
          </ReactFlow>
        </motion.div>

        {/* Chrome overlays (absolute, above the flow surface). */}
        <AltitudePill />
        <BackButton />
        <FloatingBreadcrumb />
        <ExternalsCluster />
        <Minimap />

        {isEmpty ? (
          <EmptyState
            action={
              view.level > 0
                ? { label: "Back to portfolio", onClick: () => actions.goUp(0, null) }
                : undefined
            }
          />
        ) : null}
      </div>

      <DetailPanel />

      {/* Canvas-scoped ⌘K+Shift jump palette (additive to the global ⌘K). */}
      <BrainCommandPalette />
    </div>
  );
}

/* ── Public component ────────────────────────────────────────────────────── */

export function BrainCanvas({
  graph = defaultGraph,
  initialPreset = "investor",
}: {
  graph?: BrainGraph;
  initialPreset?: PresetId;
}) {
  return (
    <ReactFlowProvider>
      <GraphProvider graph={graph} initialPreset={initialPreset}>
        <CanvasInner />
      </GraphProvider>
    </ReactFlowProvider>
  );
}
