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

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import { useReducedMotion } from "framer-motion";

import { graph as defaultGraph } from "@/lib/brain/data/graph";
import { loadPins, savePins } from "@/lib/brain/layout/pin";
import type { BrainGraph } from "@/lib/brain/types";
import type { VisibleQuery } from "@/lib/brain/selectors";
import type { LensKey, LensResult, RFEdge, RFNode, RFNodeData } from "@/lib/brain/lenses/types";
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
import { getPreset, type PresetId } from "@/lib/brain/presets";

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
import { Coachmark } from "./chrome/coachmark";
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
  const rf = useReactFlow();
  const graphWrapRef = useRef<HTMLDivElement>(null);

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

    // Preset emphasis (uxflow-02): a preset whose `emphasize` set is non-empty
    // recedes the systems NOT in it at the portfolio level, so the audience's
    // focus reads (e.g. Investor foregrounds the 3 built products). Layered on
    // top of the lens's own dimming, never overriding it brighter.
    const emphasize = getPreset(view.preset).emphasize;
    const applyPresetEmphasis =
      view.level === 0 && view.axis === "system" && emphasize.length > 0;

    const rfNodes = centeredNodes.map<Node>((n) => {
      let data = n.data as RFNodeData;
      if (
        applyPresetEmphasis &&
        data.node.system &&
        !emphasize.includes(data.node.system)
      ) {
        data = { ...data, dimmed: true, emphasis: Math.min(data.emphasis, 0.5) };
      }
      return {
        id: n.id,
        type: n.type,
        position: n.position,
        data: data as unknown as Record<string, unknown>,
        // Reflect provider selection so the custom components light up.
        selected: view.selection === n.id,
        draggable: false,
        connectable: false,
        // L0 function axis renders the function capability set, not BrainNodes.
      };
    });

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

  // Altitude signature — changes only on a real navigation (drill / up / axis /
  // preset), NOT on lens or selection. Drives the camera glide + focus restore.
  const altitudeKey = `${view.axis}:${view.level}:${view.focusSystemId ?? ""}:${
    view.focusFn ?? ""
  }:${view.focusDomainId ?? ""}`;

  // Plain-language altitude for the screen-reader live region.
  const altitudeLabel =
    view.level === 0
      ? view.axis === "function"
        ? "Capability map"
        : "Portfolio"
      : view.focusDomainId ?? view.focusSystemId ?? `Level ${view.level}`;

  // Camera glide + focus management on every altitude change. Replaces the old
  // remount-crossfade that teleported the viewport and dropped keyboard focus to
  // <body>. React Flow tweens the viewport FROM the previous framing INTO the
  // new node set, so drilling reads as a continuous zoom (FR-NAV-6); reduced
  // motion → instant. Afterward, if focus left the canvas (the node you
  // activated just unmounted), restore it to the first node so keyboard users
  // keep their place — :focus-visible keeps the ring keyboard-only, so a mouse
  // user who clicked to drill sees no focus flash.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      rf.fitView({ padding: 0.18, maxZoom: 1.45, duration: reduceMotion ? 0 : 460 });
      const wrap = graphWrapRef.current;
      if (wrap && !wrap.contains(document.activeElement)) {
        wrap
          .querySelector<HTMLElement>(".react-flow__node button")
          ?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [altitudeKey, reduceMotion]);

  // Re-fit when the canvas itself resizes (the app sidebar collapses, the window
  // resizes, the detail panel mounts/unmounts). Without this the graph drifts
  // off-center with no recovery until the next drill (scale-05). Debounced via
  // rAF so a drag-resize doesn't thrash fitView.
  useEffect(() => {
    const wrap = graphWrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        rf.fitView({ padding: 0.18, maxZoom: 1.45, duration: reduceMotion ? 0 : 240 }),
      );
    });
    ro.observe(wrap);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  // Dev guard: a derived edge whose endpoints aren't in the visible node set is
  // exactly the class of bug that shipped the silent edge-drop (link-06). Surface
  // it loudly in development so it can never regress invisibly again.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const ids = new Set(nodes.map((n) => n.id));
    const dangling = edges.filter((e) => !ids.has(e.source) || !ids.has(e.target));
    if (dangling.length > 0) {
      console.warn(
        `[brain] ${dangling.length} derived edge(s) reference a node not on screen and will be dropped:`,
        dangling.map((e) => `${e.id} (${e.source}→${e.target})`),
      );
    }
  }, [nodes, edges]);

  return (
    <div
      className="brain-root"
      role="region"
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
      {/* Skip past the ~65 rail/chrome controls straight to the graph. */}
      <a href="#brain-graph" className="brain-skip">
        Skip to architecture graph
      </a>

      {/* Screen-reader announcement of the current altitude + lens + preset. */}
      <div className="brain-sr-only" role="status" aria-live="polite">
        {`${altitudeLabel} · ${view.lens} lens · ${view.preset} view`}
      </div>

      <Rail />

      <div style={{ position: "relative", flex: 1, minWidth: 0, minHeight: 0 }}>
        <div
          id="brain-graph"
          ref={graphWrapRef}
          tabIndex={-1}
          role="application"
          aria-label="Architecture graph — pan with two fingers, zoom with the controls or pinch, click a node to drill in"
          style={{ position: "absolute", inset: 0, outline: "none" }}
        >
          <ReactFlow
            colorMode="dark"
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onPaneClick={onPaneClick}
            fitView
            fitViewOptions={{ padding: 0.18, maxZoom: 1.45 }}
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
          >
            <Background variant={BackgroundVariant.Dots} gap={42} size={1} />
            {/* On-screen zoom for mouse/keyboard users (trackpad pinch already
                works). Themed via --xy-controls-* in brain.css. */}
            <Controls
              showInteractive={false}
              position="bottom-right"
              aria-label="Zoom and fit controls"
            />
          </ReactFlow>
        </div>

        {/* Chrome overlays (absolute, above the flow surface). */}
        <AltitudePill />
        <BackButton />
        <FloatingBreadcrumb />
        <ExternalsCluster />
        <Minimap />
        <Coachmark />

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
