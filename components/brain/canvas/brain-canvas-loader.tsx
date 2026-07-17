"use client";

/**
 * THE BRAIN — client-only canvas loader.
 *
 * Loads BrainCanvas (GraphProvider + ReactFlow + chrome) as one client chunk
 * so createContext and useBrain share a single module instance. TopBar never
 * imports this tree — only brain-search-events for focus.
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
