"use client";

/**
 * THE BRAIN — full client shell for /brain.
 *
 * GraphProvider wraps the canvas tree in THIS module (not inside the dynamic
 * chunk alone) so context identity cannot diverge across bundles. TopBar
 * actions intentionally stay OUTSIDE the provider and only fire DOM events.
 */

import { TopBar } from "@/components/layout/top-bar";
import { BrainTopBarActions } from "@/components/brain/canvas/chrome/brain-topbar-actions";
import { BrainCanvasLoader } from "@/components/brain/canvas/brain-canvas-loader";

export function BrainApp({
  email,
  displayName,
}: {
  email: string;
  displayName: string;
}) {
  return (
    <div className="dark flex min-h-0 flex-1 flex-col bg-[var(--background)]">
      <TopBar
        email={email}
        displayName={displayName}
        title="Brain"
        action={<BrainTopBarActions />}
      />
      <main className="relative flex min-h-0 flex-1">
        <BrainCanvasLoader />
      </main>
    </div>
  );
}
