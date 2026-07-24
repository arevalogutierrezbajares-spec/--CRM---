import { NextResponse, type NextRequest } from "next/server";
import { requireCaptureIdentity } from "@/lib/capture/api";
import { listWorkspaceThemes } from "@/db/queries/capture-themes";
import { serializeThemeSummary } from "@/lib/capture/serialize";

export const runtime = "nodejs";

/**
 * GET /api/capture/themes — the "what themes recur" index: distinct themes
 * across the workspace's filed calls, most-recent activity first. Workspace-
 * fenced by the query.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCaptureIdentity(req);
  if (auth instanceof NextResponse) return auth;

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 200);
  const themes = await listWorkspaceThemes({ workspaceId: auth.workspaceId, limit });
  return NextResponse.json({ themes: themes.map(serializeThemeSummary) });
}
