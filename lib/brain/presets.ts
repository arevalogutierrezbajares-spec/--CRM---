/**
 * THE BRAIN — audience presets (FR-PRESET-1,2).
 *
 * A preset is a saved "reading" of the map for an audience: it picks a default
 * axis + lens and a set of systems to emphasize on entry. Investor is the v0
 * real default (lands on the State lens so BUILT/WIP reads first, roadmap
 * recedes). Agent emphasizes the three live platforms under Topology. Operator
 * also lands on Topology (liveness stays disabled until telemetry lands) —
 * health is read via interchange wires, not a dead lens.
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
  /** Optional short chip shown next to the preset label in chrome. */
  badge?: string;
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
  // Agent: topology-first — how the pieces wire together.
  agent: {
    id: "agent",
    label: "Agent",
    defaultAxis: "system",
    defaultLens: "topology",
    emphasize: ["crm", "caney", "vav"],
  },
  // Operator: topology (liveness lens is disabled until telemetry). Health is
  // read from interchange wire state — "health via wires".
  operator: {
    id: "operator",
    label: "Operator",
    defaultAxis: "system",
    defaultLens: "topology",
    emphasize: [],
    badge: "health via wires",
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
