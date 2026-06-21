/**
 * Regression guard for the silent edge-drop that made "nodes vanish their links
 * when you zoom in" (the build's headline P0). The lenses used to map React Flow
 * edge source/target to `e.from.system` while drill-level nodes are keyed by
 * `.domain`, so every spoke dangled and React Flow dropped it — invisibly.
 *
 * THIS is the test that would have caught it: for every lens × altitude × focus,
 * every emitted edge endpoint MUST be a node that is actually on screen. Plus a
 * positive check that drilling into a system renders the hub→domain spokes.
 */

import { describe, it, expect } from "vitest";
import { graph } from "@/lib/brain/data/graph";
import { navigationLens } from "@/lib/brain/lenses/navigation";
import { stateLens } from "@/lib/brain/lenses/state";
import { topologyLens } from "@/lib/brain/lenses/topology";
import { livenessLens } from "@/lib/brain/lenses/liveness";
import { functionOverlayLens } from "@/lib/brain/lenses/functionOverlay";
import type { VisibleQuery } from "@/lib/brain/selectors";
import type { LensResult } from "@/lib/brain/lenses/types";
import type { System } from "@/lib/brain/types";

const LENSES: Record<string, (g: typeof graph, q: VisibleQuery) => LensResult> = {
  navigation: navigationLens,
  state: stateLens,
  topology: topologyLens,
  liveness: livenessLens,
  function: functionOverlayLens,
};

/** Edges whose source or target is not in the rendered node set (= dropped). */
function dangling(res: LensResult): string[] {
  const ids = new Set(res.nodes.map((n) => n.id));
  return res.edges
    .filter((e) => !ids.has(e.source) || !ids.has(e.target))
    .map((e) => `${e.id} (${e.source}→${e.target})`);
}

const systems = graph.nodes.filter((n) => n.level === 1).map((n) => n.id);

const queries: { name: string; q: VisibleQuery }[] = [
  { name: "L0 portfolio", q: { level: 0, axis: "system" } },
];
for (const sysId of systems) {
  queries.push({
    name: `L1 ${sysId}`,
    q: { level: 1, axis: "system", focusSystemId: sysId as System },
  });
  const dom = graph.nodes.find((n) => n.level === 2 && n.parentId === sysId);
  if (dom) {
    queries.push({
      name: `L2 ${dom.id}`,
      q: {
        level: 2,
        axis: "system",
        focusSystemId: sysId as System,
        focusDomainId: dom.id,
      },
    });
  }
}

describe("brain: every rendered edge connects two on-screen nodes", () => {
  for (const [lensName, lens] of Object.entries(LENSES)) {
    for (const { name, q } of queries) {
      it(`${lensName} @ ${name}`, () => {
        expect(dangling(lens(graph, q))).toEqual([]);
      });
    }
  }
});

describe("brain: drilling into a system renders hub→domain spokes", () => {
  for (const sysId of systems) {
    const domainCount = graph.nodes.filter(
      (n) => n.level === 2 && n.parentId === sysId,
    ).length;
    if (domainCount === 0) continue;
    it(`${sysId} shows a centered hub + spokes`, () => {
      const res = navigationLens(graph, {
        level: 1,
        axis: "system",
        focusSystemId: sysId as System,
      });
      // The focused hub is rendered (the spokes' center anchor).
      expect(res.nodes.some((n) => n.id === sysId)).toBe(true);
      // At least one spoke connects the hub to its children.
      expect(res.edges.length).toBeGreaterThan(0);
      expect(res.edges.every((e) => e.type === "spoke" || e.type === "station")).toBe(
        true,
      );
    });
  }
});

describe("brain: drill-level siblings never share coordinates (no (0,0) pile)", () => {
  for (const sysId of systems) {
    const dom = graph.nodes.find((n) => n.level === 2 && n.parentId === sysId);
    const surfaceCount = dom
      ? graph.nodes.filter((n) => n.level === 3 && n.parentId === dom.id).length
      : 0;
    if (!dom || surfaceCount < 2) continue;
    it(`${dom.id} surfaces are laid out on distinct positions`, () => {
      const res = navigationLens(graph, {
        level: 2,
        axis: "system",
        focusSystemId: sysId as System,
        focusDomainId: dom.id,
      });
      const surfaces = res.nodes.filter((n) => n.id !== dom.id);
      const coords = new Set(surfaces.map((n) => `${n.position.x},${n.position.y}`));
      expect(coords.size).toBe(surfaces.length);
    });
  }
});
