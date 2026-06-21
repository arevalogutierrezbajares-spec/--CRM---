/**
 * THE BRAIN — audience presets (FR-PRESET-1,2).
 *
 * A preset is a saved "reading" of the map for an audience: it picks a default
 * axis + lens and a set of systems to emphasize on entry. Investor is the v0
 * real default (lands on the State lens so BUILT/WIP reads first, roadmap
 * recedes). Agent and Operator are stubs whose default lenses (topology /
 * liveness) are v1/v2 — selectable but their lenses degrade gracefully today.
 */

import type { System } from "./types";
import type { Axis } from "./selectors";
import type { LensKey } from "./lenses/types";

export type PresetId = "investor" | "agent" | "operator";

export interface Preset {
  id: PresetId;
  label: string;
  defaultAxis: Axis;
  defaultLens: LensKey;
  /** System ids to visually emphasize on entry (others recede). */
  emphasize: System[];
}

export const PRESETS: Record<PresetId, Preset> = {
  // v0 real default: investors read the portfolio by state, system-first.
  investor: {
    id: "investor",
    label: "Investor",
    defaultAxis: "system",
    defaultLens: "state",
    emphasize: ["vav", "caney", "crm"],
  },
  // Agent (v1): topology-first — how the pieces wire together.
  agent: {
    id: "agent",
    label: "Agent",
    defaultAxis: "system",
    defaultLens: "topology",
    emphasize: [],
  },
  // Operator (v2): liveness-first — what's healthy / running right now.
  operator: {
    id: "operator",
    label: "Operator",
    defaultAxis: "system",
    defaultLens: "liveness",
    emphasize: [],
  },
};

export const PRESET_LIST: Preset[] = [
  PRESETS.investor,
  PRESETS.agent,
  PRESETS.operator,
];

/** The default preset on first load. */
export const DEFAULT_PRESET: PresetId = "investor";

export function getPreset(id: PresetId): Preset {
  return PRESETS[id];
}
