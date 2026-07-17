import { graph, isGenerated } from "@/lib/brain/data/graph";
import { correlateErrorSignature } from "@/lib/brain/error-map";
import { neighborhood } from "@/lib/brain/neighborhood";
import { buildRcaPack } from "@/lib/brain/rca-pack";
import type { ToolEntry } from "./_types";

/**
 * P3: map error/route text → brain nodes; optional Sentry attachment is never
 * performed here without credentials — always degrades to offline mapping + pack.
 */
export const brainCorrelateError: ToolEntry = {
  definition: {
    name: "brain_correlate_error",
    description:
      "Map an error message, stack snippet, or route to Living Brain node ids (deterministic rules), " +
      "then attach neighborhood + a lightweight RCA pack. " +
      "Does not call Sentry unless server env is configured in future — always works offline. " +
      "Use when you have a URL path or error string and need topology grounding.",
    input_schema: {
      type: "object",
      properties: {
        error: {
          type: "string",
          description: "Error message, route, or stack snippet.",
        },
      },
      required: ["error"],
    },
  },
  async execute(input) {
    const error = String(input.error ?? "").trim();
    if (!error) return { ok: false, error: "error is required" };

    const mapped = correlateErrorSignature(error);
    const primary = mapped.primaryId;
    const neigh = primary ? neighborhood(graph, primary, 1) : null;
    const pack = buildRcaPack(graph, error, { searchLimit: 8, isGenerated });

    return {
      ok: true,
      data: {
        graphGeneratedAt: graph.generatedAt,
        correlation: mapped,
        sentryAttached: false,
        sentryNote:
          "Sentry live fetch not configured in this tool path — offline map only.",
        neighborhood:
          neigh && neigh.ok
            ? {
                focus: neigh.focus,
                nodeIds: neigh.nodes.map((n) => n.id),
                linkedDocs: neigh.linkedDocs.map((n) => ({
                  id: n.id,
                  docs_ref: n.docs_ref,
                })),
              }
            : neigh,
        rca: {
          primaryId: pack.primaryId,
          hypotheses: pack.hypotheses,
          failureModes: pack.failureModes,
          guidance: pack.guidance,
          freshness: pack.freshness,
        },
      },
    };
  },
};
