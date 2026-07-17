import { graph, isGenerated } from "@/lib/brain/data/graph";
import { buildRcaPack } from "@/lib/brain/rca-pack";
import type { ToolEntry } from "./_types";

export const brainRcaPack: ToolEntry = {
  definition: {
    name: "brain_rca_pack",
    description:
      "One-shot RCA investigation pack for a symptom or capability query: brain search hits, " +
      "primary neighborhood, linked failure-mode docs, ranked hypotheses, freshness, and guidance. " +
      "Use at the start of incident diagnosis. Deterministic — no LLM. Follow with brain_doc_get on cited paths.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Symptom or capability, e.g. 'partner room 500', 'email sync', 'posada onboarding timeout'.",
        },
        limit: {
          type: "number",
          description: "Search hit limit (default 12).",
        },
      },
      required: ["query"],
    },
  },
  async execute(input) {
    const query = String(input.query ?? "").trim();
    if (!query) return { ok: false, error: "query is required" };
    const limitRaw = Number(input.limit ?? 12);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(30, Math.max(1, Math.floor(limitRaw)))
      : 12;
    const pack = buildRcaPack(graph, query, {
      searchLimit: limit,
      isGenerated,
    });
    // Compact neighborhood for tokens
    const neigh = pack.neighborhood;
    return {
      ok: true,
      data: {
        ...pack,
        neighborhood:
          neigh && neigh.ok
            ? {
                ok: true,
                focus: neigh.focus,
                depth: neigh.depth,
                truncated: neigh.truncated,
                nodeIds: neigh.nodes.map((n) => n.id),
                edgeIds: neigh.edges.map((e) => e.id),
                linkedDocs: neigh.linkedDocs.map((n) => ({
                  id: n.id,
                  label: n.label,
                  docs_ref: n.docs_ref,
                })),
                nodes: neigh.nodes.slice(0, 25).map((n) => ({
                  id: n.id,
                  kind: n.kind,
                  label: n.label,
                  system: n.system,
                  docs_ref: n.docs_ref,
                })),
              }
            : neigh,
      },
    };
  },
};
