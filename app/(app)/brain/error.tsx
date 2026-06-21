"use client";

/**
 * THE BRAIN — Next.js error boundary (app/(app)/brain/error.tsx).
 *
 * Next.js renders this Client Component when a render throw occurs in the
 * Brain route segment. Prevents the blank white screen that would otherwise
 * appear because the canvas is `ssr:false` dynamic — an uncaught throw
 * currently unmounts to nothing (NFR-OBS-4: degrade visibly, never blank).
 *
 * Wires the existing <ErrorState> component's onRetry to Next.js's `reset`
 * function, which re-renders the segment tree from scratch.
 */

import { ErrorState } from "@/components/brain/canvas/states/error-state";

export default function BrainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#08090c",
        display: "grid",
        placeItems: "center",
      }}
    >
      <ErrorState
        error={error}
        onRetry={reset}
        title="The map couldn't load"
        message="The architecture graph failed to render. This is a display fault — your data is intact."
      />
    </div>
  );
}
