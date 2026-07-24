import { NextResponse, type NextRequest } from "next/server";
import { requireCaptureIdentity } from "@/lib/capture/api";
import { getThemeTimeline } from "@/db/queries/capture-themes";
import { serializeThemeTimeline } from "@/lib/capture/serialize";

export const runtime = "nodejs";

type Params = Promise<{ key: string }>;

/**
 * GET /api/capture/themes/{key}/timeline — cross-call timeline for one theme:
 * newest-first calls that touched it plus a rollup (call count, first/last
 * seen, coverage distribution). Workspace-fenced by the query. A non-existent
 * theme is valid — it returns an empty timeline (callCount 0, calls []), never
 * a 404.
 */
export async function GET(req: NextRequest, props: { params: Params }) {
  const auth = await requireCaptureIdentity(req);
  if (auth instanceof NextResponse) return auth;

  const { key } = await props.params;
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 10, 100);

  const timeline = await getThemeTimeline({
    workspaceId: auth.workspaceId,
    key,
    limit,
  });
  return NextResponse.json(serializeThemeTimeline(timeline));
}
