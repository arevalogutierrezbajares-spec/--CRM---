import { graph } from "@/lib/brain/data/graph";
import { neighborhood } from "@/lib/brain/neighborhood";
import type { ToolEntry } from "./_types";

export const brainNeighborhood: ToolEntry = {
  definition: {
    name: "brain_neighborhood",
    description:
      "Expand a Living Brain node or interchange edge into a bounded neighborhood: " +
      "adjacent nodes, edges, linked documentation (documents edges), and graph timestamp. " +
      "Use AFTER brain_search when diagnosing blast radius / RCA. Pass a node id " +
      "(e.g. crm.partner-rooms, vav.booking) or interchange id (e.g. ix3). Depth 1 (default) or 2.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Brain node id or interchange edge id from brain_search.",
        },
        depth: {
          type: "number",
          description: "Expansion depth 1–2. Default 1.",
        },
      },
      required: ["id"],
    },
  },
  async execute(input) {
    const id = String(input.id ?? "").trim();
    if (!id) return { ok: false, error: "id is required" };
    const depthRaw = Number(input.depth ?? 1);
    const depth = Number.isFinite(depthRaw) ? depthRaw : 1;
    const result = neighborhood(graph, id, depth);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    return {
      ok: true,
      data: {
        ...result,
        nodeCount: result.nodes.length,
        edgeCount: result.edges.length,
        linkedDocCount: result.linkedDocs.length,
        // Compact nodes for token efficiency
        nodes: result.nodes.map((n) => ({
          id: n.id,
          kind: n.kind,
          label: n.label,
          system: n.system,
          state: n.state,
          docs_ref: n.docs_ref,
          summary: n.summary
            ? n.summary.slice(0, 200)
            : null,
        })),
        edges: result.edges.map((e) => ({
          id: e.id,
          kind: e.kind,
          from: e.from,
          to: e.to,
          purpose: e.purpose,
          health: e.health,
          contract_status: e.contract_status,
        })),
        linkedDocs: result.linkedDocs.map((n) => ({
          id: n.id,
          label: n.label,
          docs_ref: n.docs_ref,
          summary: n.summary ? n.summary.slice(0, 200) : null,
        })),
      },
    };
  },
};
