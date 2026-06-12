import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { getHelperDownloadUrl } from "@/lib/capture/downloads";

/**
 * Workspace-member download of the macOS Capture Helper. Session-authed (a
 * logged-in cofounder, not the Helper token). Redirects to a short-lived
 * signed URL for the current published build.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dl = await getHelperDownloadUrl(300);
  if (!dl) {
    return NextResponse.json(
      { error: "No Helper build has been published yet. Run macos-helper/scripts/release.sh." },
      { status: 404 },
    );
  }
  return NextResponse.redirect(dl.url, 302);
}
