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
      "for systems, domains, API surfaces, entities, cross-system interchanges (wires), " +
      "and documentation (kind doc/adr — runbooks, ADRs, requirements). " +
      "Use BEFORE inventing a new route or capability, and at the start of RCA. " +
      "Hit kinds: system|domain|surface|entity|interchange|doc|adr. " +
      "After a hit, call brain_neighborhood(id) then brain_doc_get for docs_ref paths. " +
      "If matches is empty, verify synonyms/typos before building — do not invent surfaces. Deterministic, no AI cost.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "What to look for, e.g. 'booking webhook', '/api/holds', 'posada onboarding', 'brain ops', 'ix3'.",
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
          ? `No indexed match for "${query}" — verify before building (typos/synonyms may not appear).`
          : `Found ${result.matches.length} match(es) for "${query}". Reuse or extend; call brain_neighborhood on architecture ids.`,
        matches: result.matches,
        graphGeneratedAt: graph.generatedAt,
        nextSteps: result.safeToBuild
          ? ["Verify manually", "Try alternate query tokens", "brain_freshness"]
          : [
              "brain_neighborhood on primary architecture id",
              "brain_doc_get for doc/adr hits or docs_ref",
              "brain_rca_pack for full investigation pack",
            ],
      },
    };
  },
};
