import { requireUser } from "@/lib/current-user";
import { BrainApp } from "@/components/brain/canvas/brain-app";

/**
 * THE BRAIN — /brain route (async server component).
 * Auth only; all client chrome/canvas lives in BrainApp.
 */
export default async function BrainPage() {
  const user = await requireUser();

  return (
    <BrainApp email={user.email} displayName={user.displayName} />
  );
}
