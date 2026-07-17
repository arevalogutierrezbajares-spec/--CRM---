import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { BrainCanvasLoader } from "@/components/brain/canvas/brain-canvas-loader";
import { BrainTopBarActions } from "@/components/brain/canvas/chrome/brain-topbar-actions";

/**
 * THE BRAIN — /brain route (async server component).
 *
 * Thin auth shell + TopBar (with map search chip) + full-bleed canvas.
 * Forced `.dark` keeps TopBar/canvas on warm CRM dark tokens together.
 */
export default async function BrainPage() {
  const user = await requireUser();

  return (
    <div className="dark flex min-h-0 flex-1 flex-col bg-[var(--background)]">
      <TopBar
        email={user.email}
        displayName={user.displayName}
        title="Brain"
        action={<BrainTopBarActions />}
      />
      <main className="relative flex min-h-0 flex-1">
        <BrainCanvasLoader />
      </main>
    </div>
  );
}
