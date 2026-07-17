import { graph, isGenerated } from "@/lib/brain/data/graph";
import { brainFreshness } from "@/lib/brain/freshness";
import type { ToolEntry } from "./_types";

export const brainFreshnessTool: ToolEntry = {
  definition: {
    name: "brain_freshness",
    description:
      "Return Living Brain graph freshness: generatedAt, age, per-system commit SHAs, " +
      "node/edge/doc counts, stale flag. Call when trusting topology for RCA.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  async execute() {
    const data = brainFreshness(graph, { isGenerated });
    return { ok: true, data };
  },
};
