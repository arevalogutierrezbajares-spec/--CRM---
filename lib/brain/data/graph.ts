/**
 * THE BRAIN — graph loader.
 *
 * Resolves the active BrainGraph: the generated extractor artifact
 * (lib/brain/generated/brain-graph.json) when it has been populated, else the
 * hand-authored SAMPLE fallback. Statically imported so the page cold-renders
 * without a DB round-trip (NFR-PERF-1). Once the pipeline runs and the JSON has
 * nodes, that artifact wins automatically — no code change needed.
 */

import generated from "./../generated/brain-graph.json";
import type { BrainGraph } from "../types";
import { SAMPLE } from "./sample";

/** Whether the generated artifact has real content. */
function hasContent(g: { nodes?: unknown[] } | null | undefined): boolean {
  return Array.isArray(g?.nodes) && g!.nodes!.length > 0;
}

/**
 * The active graph. Generated artifact when populated, SAMPLE otherwise.
 * The cast is safe: the generator emits the schema authored in types.ts, and
 * SAMPLE is statically typed as BrainGraph.
 */
export const graph: BrainGraph = (
  hasContent(generated as { nodes?: unknown[] }) ? generated : SAMPLE
) as BrainGraph;

/** True when the active graph came from the generated pipeline (not SAMPLE). */
export const isGenerated: boolean = hasContent(generated as { nodes?: unknown[] });
