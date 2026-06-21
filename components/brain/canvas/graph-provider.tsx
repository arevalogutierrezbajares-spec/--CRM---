"use client";

/**
 * THE BRAIN — graph provider (THE state contract).
 *
 * Holds the immutable BrainGraph + the mutable `view` (altitude/axis/lens/
 * preset/focus/selection/crumbs) and exposes a pure reducer via `useBrain()`.
 * Every downstream component (nodes, edges, chrome, panel) reads view state and
 * dispatches actions through this hook — there is no other source of truth.
 *
 * The reducer is PURE and synchronous: navigation/lens/axis/preset changes
 * never refetch (NFR-PERF-2); they only re-derive from the in-memory graph.
 *
 * View preferences (axis / lens / preset) are persisted to localStorage under
 * `brain.view.v1` and hydrated synchronously in the `useReducer` lazy
 * initializer. The canvas mounts via next/dynamic({ssr:false}) so the provider
 * is client-only — the initializer reads localStorage with no risk of a
 * mismatch; the localStorage values are applied in a follow-up paint.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { BrainGraph, NodeLevel, System } from "@/lib/brain/types";
import { breadcrumbFor, type Axis, type BreadcrumbItem } from "@/lib/brain/selectors";
import type { LensKey } from "@/lib/brain/lenses/types";
import {
  DEFAULT_PRESET,
  getPreset,
  type PresetId,
} from "@/lib/brain/presets";

/* ── View-preference persistence (SSR-safe) ─────────────────────────────── */

const VIEW_PREF_KEY = "brain.view.v1";

interface ViewPrefs {
  axis?: Axis;
  lens?: LensKey;
  preset?: PresetId;
}

function loadViewPrefs(): ViewPrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(VIEW_PREF_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ViewPrefs;
  } catch {
    return {};
  }
}

function saveViewPrefs(prefs: ViewPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(VIEW_PREF_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable — not fatal.
  }
}

/* ── View state ──────────────────────────────────────────────────────────── */

export interface BrainView {
  /** Current altitude: 0 portfolio · 1 system · 2 domain · 3 surface. */
  level: NodeLevel;
  /** Reading axis. */
  axis: Axis;
  /** Active lens. */
  lens: LensKey;
  /** Active audience preset. */
  preset: PresetId;
  /** System being drilled into (L1+), or null at portfolio. */
  focusSystemId: System | null;
  /** Function being drilled into when axis === "function". */
  focusFn: string | null;
  /** Domain node id being drilled into at L2. */
  focusDomainId: string | null;
  /** Currently selected node/edge id (drives the detail panel), or null. */
  selection: string | null;
  /** Ordered node-id path root→focus (drives breadcrumbs + up-paths). */
  path: string[];
  /** Resolved breadcrumb items for the current path. */
  crumbs: BreadcrumbItem[];
  /** Expanded roadmap-cluster parent ids (FR-NAV-7 pop-open). */
  expandedClusters: string[];
}

/* ── Actions ─────────────────────────────────────────────────────────────── */

export type BrainAction =
  | { type: "DRILL_INTO"; nodeId: string; level: NodeLevel; system?: System | null; domainId?: string | null; fn?: string | null }
  | { type: "GO_UP"; toLevel?: NodeLevel; nodeId?: string | null }
  | { type: "SET_AXIS"; axis: Axis }
  | { type: "SET_LENS"; lens: LensKey }
  | { type: "SET_PRESET"; preset: PresetId }
  | { type: "SELECT"; id: string | null }
  | { type: "EXPAND_CLUSTER"; clusterId: string }
  | { type: "CLEAR" };

/* ── Initial state ───────────────────────────────────────────────────────── */

function initialView(graph: BrainGraph, preset: PresetId): BrainView {
  const p = getPreset(preset);
  return {
    level: 0,
    axis: p.defaultAxis,
    lens: p.defaultLens,
    preset,
    focusSystemId: null,
    focusFn: null,
    focusDomainId: null,
    selection: null,
    path: [],
    crumbs: breadcrumbFor(graph, [], p.defaultAxis),
    expandedClusters: [],
  };
}

/* ── Reducer (pure) ──────────────────────────────────────────────────────── */

function makeReducer(graph: BrainGraph) {
  return function reducer(state: BrainView, action: BrainAction): BrainView {
    switch (action.type) {
      case "DRILL_INTO": {
        const path = [...state.path, action.nodeId];
        return {
          ...state,
          level: action.level,
          focusSystemId:
            action.system !== undefined ? action.system : state.focusSystemId,
          focusDomainId:
            action.domainId !== undefined ? action.domainId : state.focusDomainId,
          focusFn: action.fn !== undefined ? action.fn : state.focusFn,
          selection: action.nodeId,
          path,
          crumbs: breadcrumbFor(graph, path, state.axis),
        };
      }

      case "GO_UP": {
        // Pop to a target level (default: one altitude up).
        const target =
          action.toLevel ?? ((Math.max(0, state.level - 1) as NodeLevel));
        const path = state.path.slice(0, target);
        return {
          ...state,
          level: target,
          focusDomainId: target < 2 ? null : state.focusDomainId,
          focusSystemId: target < 1 ? null : state.focusSystemId,
          focusFn: target < 1 ? null : state.focusFn,
          selection: action.nodeId ?? null,
          path,
          crumbs: breadcrumbFor(graph, path, state.axis),
        };
      }

      case "SET_AXIS": {
        // Switching axis resets to portfolio (the two axes are distinct roots).
        return {
          ...state,
          axis: action.axis,
          level: 0,
          focusSystemId: null,
          focusFn: null,
          focusDomainId: null,
          selection: null,
          path: [],
          crumbs: breadcrumbFor(graph, [], action.axis),
        };
      }

      case "SET_LENS":
        // Pure restyle — never changes altitude or refetches (NFR-PERF-2).
        return { ...state, lens: action.lens };

      case "SET_PRESET": {
        const p = getPreset(action.preset);
        // Preset adopts its default axis+lens and returns to portfolio.
        return {
          ...state,
          preset: action.preset,
          axis: p.defaultAxis,
          lens: p.defaultLens,
          level: 0,
          focusSystemId: null,
          focusFn: null,
          focusDomainId: null,
          selection: null,
          path: [],
          crumbs: breadcrumbFor(graph, [], p.defaultAxis),
        };
      }

      case "SELECT":
        return { ...state, selection: action.id };

      case "EXPAND_CLUSTER":
        return state.expandedClusters.includes(action.clusterId)
          ? state
          : {
              ...state,
              expandedClusters: [...state.expandedClusters, action.clusterId],
            };

      case "CLEAR":
        return { ...state, selection: null };

      default:
        return state;
    }
  };
}

/* ── Context ─────────────────────────────────────────────────────────────── */

export interface BrainContextValue {
  graph: BrainGraph;
  view: BrainView;
  dispatch: React.Dispatch<BrainAction>;
  /** Action creators (the public dispatch API). */
  actions: {
    drillInto: (args: {
      nodeId: string;
      level: NodeLevel;
      system?: System | null;
      domainId?: string | null;
      fn?: string | null;
    }) => void;
    goUp: (toLevel?: NodeLevel, nodeId?: string | null) => void;
    setAxis: (axis: Axis) => void;
    setLens: (lens: LensKey) => void;
    setPreset: (preset: PresetId) => void;
    select: (id: string | null) => void;
    expandCluster: (clusterId: string) => void;
    clear: () => void;
  };
}

const BrainContext = createContext<BrainContextValue | null>(null);

export function GraphProvider({
  graph,
  initialPreset = DEFAULT_PRESET,
  children,
}: {
  graph: BrainGraph;
  initialPreset?: PresetId;
  children: ReactNode;
}) {
  const reducer = useMemo(() => makeReducer(graph), [graph]);
  // Hydrate from localStorage in the lazy initializer. The canvas is mounted
  // via next/dynamic({ssr:false}) so the provider only ever renders on the
  // client — there is NO server render to mismatch. Applying the stored prefs
  // through the reducer here (preset first, then the user's explicit axis/lens)
  // makes the very first committed state correct, avoiding the effect-ordering
  // race where a persist effect would clobber the stored prefs on mount.
  const [view, dispatch] = useReducer(reducer, undefined, () => {
    let v = initialView(graph, initialPreset);
    if (typeof window === "undefined") return v;
    const prefs = loadViewPrefs();
    if (prefs.preset) v = reducer(v, { type: "SET_PRESET", preset: prefs.preset });
    if (prefs.axis) v = reducer(v, { type: "SET_AXIS", axis: prefs.axis });
    if (prefs.lens) v = reducer(v, { type: "SET_LENS", lens: prefs.lens });
    return v;
  });

  // Persist axis/lens/preset whenever they change. (On mount this re-writes the
  // same values that hydrated the initial state — a harmless no-op, not a clobber.)
  useEffect(() => {
    saveViewPrefs({ axis: view.axis, lens: view.lens, preset: view.preset });
  }, [view.axis, view.lens, view.preset]);

  const value = useMemo<BrainContextValue>(
    () => ({
      graph,
      view,
      dispatch,
      actions: {
        drillInto: (args) => dispatch({ type: "DRILL_INTO", ...args }),
        goUp: (toLevel, nodeId) =>
          dispatch({ type: "GO_UP", toLevel, nodeId }),
        setAxis: (axis) => dispatch({ type: "SET_AXIS", axis }),
        setLens: (lens) => dispatch({ type: "SET_LENS", lens }),
        setPreset: (preset) => dispatch({ type: "SET_PRESET", preset }),
        select: (id) => dispatch({ type: "SELECT", id }),
        expandCluster: (clusterId) =>
          dispatch({ type: "EXPAND_CLUSTER", clusterId }),
        clear: () => dispatch({ type: "CLEAR" }),
      },
    }),
    [graph, view],
  );

  return <BrainContext.Provider value={value}>{children}</BrainContext.Provider>;
}

/** THE state hook. Throws if used outside <GraphProvider>. */
export function useBrain(): BrainContextValue {
  const ctx = useContext(BrainContext);
  if (!ctx) {
    throw new Error("useBrain() must be used within <GraphProvider>");
  }
  return ctx;
}
