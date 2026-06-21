import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { BrainCanvasLoader } from "@/components/brain/canvas/brain-canvas-loader";

/**
 * THE BRAIN — /brain route (async server component).
 *
 * Thin auth shell: requireUser() (the (app) layout + proxy.ts middleware already
 * gate this path) + the per-page TopBar, then mounts the client-only React Flow
 * canvas. The graph is statically imported inside the canvas (lib/brain/data/
 * graph.ts → generated artifact or SAMPLE fallback) so there is no DB round-trip
 * (NFR-PERF-1). Coexists with the sibling server-action files (actions.ts /
 * conversation-memory.ts / post-meeting-actions.ts) — they are not route handlers.
 */
export default async function BrainPage() {
  const user = await requireUser();

  // Force the whole /brain route dark: the canvas is a self-contained dark token
  // island, so without this the theme-aware TopBar renders LIGHT in light mode
  // and seams against the dark canvas below it. `dark` scopes the app's dark
  // tokens to this subtree regardless of the user's global theme.
  return (
    <div className="dark flex min-h-0 flex-1 flex-col bg-[var(--background)]">
      <TopBar email={user.email} displayName={user.displayName} title="Brain" />
      <main className="relative flex min-h-0 flex-1">
        <BrainCanvasLoader />
      </main>
    </div>
  );
}
