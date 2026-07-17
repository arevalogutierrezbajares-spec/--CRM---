import { graph } from "@/lib/brain/data/graph";
import { searchBrain } from "@/lib/brain/search";
import type { ToolEntry } from "./_types";

/**
 * Rebuild-guard: does a capability / route / domain already exist in the
 * portfolio graph? Deterministic — no LLM in this tool.
 */
export const brainSearch: ToolEntry = {
  definition: {
    name: "brain_search",
    description:
      "Search the Living Brain portfolio map (VAV, CaneyCloud, AGB-CRM, Restaurants, Academy) " +
      "for existing systems, domains, API surfaces, entities, or cross-system interchanges. " +
      "Use BEFORE inventing a new route or capability. If matches is empty and safeToBuild is true, " +
      "nothing similar exists in the graph. Returns ranked hits with id/kind/path — no AI cost.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "What to look for, e.g. 'booking webhook', '/api/holds', 'posada onboarding', 'ix1'.",
        },
        limit: {
          type: "number",
          description: "Max hits (1–30). Default 12.",
        },
      },
      required: ["query"],
    },
  },
  async execute(input) {
    const query = String(input.query ?? "").trim();
    if (!query) {
      return { ok: false, error: "query is required" };
    }
    const limitRaw = Number(input.limit ?? 12);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(30, Math.max(1, Math.floor(limitRaw)))
      : 12;

    const result = searchBrain(graph, query, limit);
    return {
      ok: true,
      data: {
        query: result.query,
        matchCount: result.matches.length,
        safeToBuild: result.safeToBuild,
        message: result.safeToBuild
          ? `No match for "${query}" — safe to build (nothing similar in the Brain graph).`
          : `Found ${result.matches.length} match(es) for "${query}". Reuse or extend before building new.`,
        matches: result.matches,
        graphGeneratedAt: graph.generatedAt,
      },
    };
  },
};
