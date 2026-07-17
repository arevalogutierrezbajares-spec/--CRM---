/**
 * THE BRAIN — shareable URL deep-links.
 *
 * Query params (all optional):
 *   preset · axis · lens · node · q
 *
 * `node` navigates via navFromHit (drill + select). Prefs in localStorage still
 * apply for axis/lens/preset when the URL omits them; URL wins when present.
 */

import type { BrainGraph, NodeLevel, System } from "./types";
import type { Axis } from "./selectors";
import type { LensKey } from "./lenses/types";
import type { PresetId } from "./presets";
import { PRESETS } from "./presets";
import { navFromHit, type BrainNavAction } from "./navigate";
import type { BrainSearchHit } from "./search";

const AXES = new Set<Axis>(["system", "function"]);
const LENSES = new Set<LensKey>([
  "navigation",
  "state",
  "function",
  "topology",
  "liveness",
]);
const PRESET_IDS = new Set<string>(Object.keys(PRESETS));

export interface BrainUrlState {
  preset?: PresetId;
  axis?: Axis;
  lens?: LensKey;
  /** Node or interchange edge id to open. */
  node?: string;
  /** Prefill rebuild-guard query. */
  q?: string;
}

export function parseBrainUrl(search: string): BrainUrlState {
  const sp = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const out: BrainUrlState = {};

  const preset = sp.get("preset");
  if (preset && PRESET_IDS.has(preset)) out.preset = preset as PresetId;

  const axis = sp.get("axis");
  if (axis && AXES.has(axis as Axis)) out.axis = axis as Axis;

  const lens = sp.get("lens");
  if (lens && LENSES.has(lens as LensKey)) out.lens = lens as LensKey;

  const node = sp.get("node")?.trim();
  if (node) out.node = node;

  const q = sp.get("q")?.trim();
  if (q) out.q = q;

  return out;
}

export interface BrainUrlViewSlice {
  level: NodeLevel;
  axis: Axis;
  lens: LensKey;
  preset: PresetId;
  focusSystemId: System | null;
  focusDomainId: string | null;
  selection: string | null;
}

/** Serialize navigation state for history.replaceState (omits defaults). */
export function serializeBrainUrl(
  view: BrainUrlViewSlice,
  opts?: { q?: string; defaultPreset?: PresetId },
): string {
  const sp = new URLSearchParams();
  const defPreset = opts?.defaultPreset ?? "investor";

  if (view.preset !== defPreset) sp.set("preset", view.preset);
  if (view.axis !== "system") sp.set("axis", view.axis);
  if (view.lens !== getPresetDefaultLens(view.preset)) {
    sp.set("lens", view.lens);
  }

  const nodeId =
    view.selection ??
    view.focusDomainId ??
    (view.level >= 1 && view.focusSystemId ? view.focusSystemId : null);
  if (nodeId) sp.set("node", nodeId);

  if (opts?.q?.trim()) sp.set("q", opts.q.trim());

  const s = sp.toString();
  return s ? `?${s}` : "";
}

function getPresetDefaultLens(preset: PresetId): LensKey {
  return PRESETS[preset]?.defaultLens ?? "state";
}

/** Build nav actions for a deep-linked node/edge id. */
export function navFromNodeId(
  graph: BrainGraph,
  nodeId: string,
): BrainNavAction[] {
  // Synthetic By-Function hubs are not BrainNodes — drill with fn set.
  if (nodeId.startsWith("fn.")) {
    const fn = nodeId.slice(3);
    if (fn && graph.functions.some((f) => f.id === fn)) {
      return [
        {
          type: "drill",
          nodeId,
          level: 1,
          system: null,
          fn,
        },
      ];
    }
  }

  const edge = graph.edges.find((e) => e.id === nodeId);
  if (edge) {
    const hit: BrainSearchHit = {
      id: edge.id,
      kind: "interchange",
      label: edge.purpose ?? edge.id,
      path: `${edge.from.system} → ${edge.to.system}`,
      score: 1,
      system: edge.from.system,
    };
    return navFromHit(graph, hit);
  }

  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return [{ type: "select", id: nodeId }];

  const hit: BrainSearchHit = {
    id: node.id,
    kind:
      node.kind === "system"
        ? "system"
        : node.kind === "domain"
          ? "domain"
          : node.kind === "entity"
            ? "entity"
            : "surface",
    label: node.label,
    path: node.id,
    score: 1,
    system: node.system,
  };
  return navFromHit(graph, hit);
}

/** Write current brain state into the address bar without a navigation. */
export function pushBrainUrl(
  view: BrainUrlViewSlice,
  opts?: { q?: string },
): void {
  if (typeof window === "undefined") return;
  try {
    const qs = serializeBrainUrl(view, opts);
    const next = `${window.location.pathname}${qs}${window.location.hash}`;
    const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== cur) {
      window.history.replaceState(null, "", next);
    }
  } catch {
    // History API unavailable — ignore.
  }
}
