/**
 * Jump from a rebuild-guard search hit into the Brain view.
 * Pure decision of drill/select actions — no React.
 */

import type { BrainGraph, System } from "./types";
import type { BrainSearchHit } from "./search";

export type BrainNavAction =
  | {
      type: "drill";
      nodeId: string;
      level: 1 | 2;
      system: System | null;
      domainId?: string | null;
      /** By-Function axis hub id segment (nodeId `fn.<fn>`). */
      fn?: string | null;
    }
  | { type: "select"; id: string };

/**
 * Map a search hit to the provider actions that should run.
 * Surfaces/entities: drill to parent domain then select the node.
 */
export function navFromHit(
  graph: BrainGraph,
  hit: BrainSearchHit,
): BrainNavAction[] {
  if (hit.kind === "interchange") {
    return [{ type: "select", id: hit.id }];
  }

  // Documentation: prefer linked architecture node via documents edge.
  if (hit.kind === "doc" || hit.kind === "adr") {
    const link = graph.edges.find(
      (e) =>
        e.kind === "documents" &&
        (e.from.domain === hit.id || e.id.includes(hit.id)),
    );
    if (link?.to?.domain) {
      const target = graph.nodes.find((n) => n.id === link.to.domain);
      if (target) {
        return navFromHit(graph, {
          id: target.id,
          kind:
            target.kind === "system"
              ? "system"
              : target.kind === "domain"
                ? "domain"
                : target.kind === "entity"
                  ? "entity"
                  : "surface",
          label: target.label,
          system: target.system,
          path: target.id,
          score: hit.score,
        });
      }
    }
    return [{ type: "select", id: hit.id }];
  }

  const node = graph.nodes.find((n) => n.id === hit.id);
  if (!node) {
    // Portal / synthetic
    if (hit.id.includes(".__portal.")) return [{ type: "select", id: hit.id }];
    return [{ type: "select", id: hit.id }];
  }

  if (node.level === 1 && node.system) {
    return [
      {
        type: "drill",
        nodeId: node.id,
        level: 1,
        system: node.system,
      },
    ];
  }

  if (node.level === 2 && node.system) {
    return [
      {
        type: "drill",
        nodeId: node.id,
        level: 2,
        system: node.system,
        domainId: node.id,
      },
    ];
  }

  // L3 surface / entity — open parent domain, select this node
  if (node.level === 3 && node.parentId && node.system) {
    return [
      {
        type: "drill",
        nodeId: node.parentId,
        level: 2,
        system: node.system,
        domainId: node.parentId,
      },
      { type: "select", id: node.id },
    ];
  }

  return [{ type: "select", id: hit.id }];
}
