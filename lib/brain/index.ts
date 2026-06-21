/**
 * THE BRAIN — lib barrel.
 *
 * Single import surface for the pure graph engine. Components import from
 * "@/lib/brain". The provider (a client component) lives in components/ and is
 * NOT re-exported here to keep this module server-safe.
 */

// Schema + status constants.
export * from "./types";

// Capability map (functions + FN_COLOR + FN_MAP + computeFunctions).
export * from "./functions";

// Pure selectors (visibility, clustering, breadcrumbs, up-paths).
export * from "./selectors";

// Audience presets.
export * from "./presets";

// Lens output contract + reducers.
export type { LensKey, LensResult, RFNode, RFEdge, RFNodeData, RFEdgeData } from "./lenses/types";
export { navigationLens, nodeTypeFor } from "./lenses/navigation";
export { stateLens } from "./lenses/state";
export { topologyLens } from "./lenses/topology";
export { livenessLens } from "./lenses/liveness";
export { functionOverlayLens } from "./lenses/functionOverlay";

// Layout engine.
export { radialLayout, ringLayout } from "./layout/radial";
export { layeredLayout } from "./layout/layered";
export {
  getPinned,
  setPinned,
  seedPin,
  resolvePin,
  hasPin,
  clearPin,
  clearAllPins,
  snapshotPins,
  loadPins,
  savePins,
} from "./layout/pin";

// Data: the active graph + sample fallback.
export { graph, isGenerated } from "./data/graph";
export { SAMPLE, EXTERNALS } from "./data/sample";
