/**
 * THE BRAIN — analytics barrel.
 *
 * Graphology-powered, deterministic gap-finding over the semantic subgraph.
 * Kept OUT of the main `@/lib/brain` barrel so graphology only loads where the
 * insights are actually rendered. Import from "@/lib/brain/analytics".
 */

export {
  computeInsights,
  SEMANTIC_EDGE_KINDS,
  type BrainInsights,
  type NodeRef,
  type HubInsight,
  type CycleInsight,
  type CycleVia,
  type GapInsight,
  type CommunityInsight,
} from "./insights";
