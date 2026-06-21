"use client";

/**
 * THE BRAIN — client-only canvas loader.
 *
 * @xyflow/react measures the DOM and touches `window` at render, so the canvas
 * cannot be server-rendered (a hard GET of /brain would 500). Defer to the
 * client with next/dynamic({ ssr: false }) — the established BlockNote pattern
 * (components/lob/doc-editor-loader.tsx). The portfolio-silhouette skeleton
 * (LoadingState) fills the gap so the route never flashes blank (NFR-OBS-4).
 */

import dynamic from "next/dynamic";
import "./brain.css";
import { LoadingState } from "./states/loading-state";

export const BrainCanvasLoader = dynamic(
  () => import("./brain-canvas").then((m) => m.BrainCanvas),
  {
    ssr: false,
    loading: () => (
      <div
        className="brain-root"
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          background: "var(--bg)",
        }}
      >
        <LoadingState />
      </div>
    ),
  },
);
