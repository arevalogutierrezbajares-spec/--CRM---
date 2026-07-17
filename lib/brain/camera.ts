/**
 * THE BRAIN — camera settle helpers for professional drill / zoom framing.
 *
 * Pure options (no React). Canvas uses these so fitView is consistent across
 * post-layout settle, Controls "fit", double-click pane, and resize recovery.
 *
 * Padding is asymmetric: altitude pill + trust stack top, minimap + zoom
 * controls bottom — so the graph's visual center sits in the open canvas, not
 * the geometric center of the full React Flow pane.
 */

export const BRAIN_MAX_ZOOM = 1.5;
export const BRAIN_MIN_ZOOM = 0.28;

/** Fractional padding of the viewport (xyflow fitView convention). */
export const BRAIN_FIT_PADDING = {
  top: 0.14,
  right: 0.1,
  bottom: 0.2,
  left: 0.1,
} as const;

export type BrainFitMode = "layout" | "resize" | "manual";

export function brainFitDuration(
  mode: BrainFitMode,
  reduceMotion: boolean | null,
): number {
  if (reduceMotion) return 0;
  switch (mode) {
    case "layout":
      return 420;
    case "resize":
      return 240;
    case "manual":
      return 320;
    default:
      return 360;
  }
}

export function brainFitViewOptions(
  mode: BrainFitMode,
  reduceMotion: boolean | null,
  nodeCount = 0,
) {
  // Dense graphs need a touch more air so chips don't kiss chrome.
  const dense = nodeCount > 16;
  const padding = dense
    ? {
        top: BRAIN_FIT_PADDING.top + 0.04,
        right: BRAIN_FIT_PADDING.right + 0.02,
        bottom: BRAIN_FIT_PADDING.bottom + 0.04,
        left: BRAIN_FIT_PADDING.left + 0.02,
      }
    : { ...BRAIN_FIT_PADDING };

  return {
    padding,
    maxZoom: BRAIN_MAX_ZOOM,
    minZoom: BRAIN_MIN_ZOOM,
    duration: brainFitDuration(mode, reduceMotion),
  };
}

/**
 * Prefer optical center on the focused hub when present; otherwise full graph.
 * Returns node ids for fitView({ nodes }) — empty means fit all.
 */
export function preferredFitNodeIds(
  allIds: string[],
  focusId: string | null | undefined,
): string[] {
  if (focusId && allIds.includes(focusId) && allIds.length > 1) {
    // Include focus + siblings so the ring frames as a whole, hub visually central.
    return allIds;
  }
  return allIds;
}
