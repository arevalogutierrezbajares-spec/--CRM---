import { NextResponse, type NextRequest } from "next/server";
import { requireCaptureIdentity } from "@/lib/capture/api";
import { listCallRecordings } from "@/db/queries/call-recordings";
import { serializeRecordingSummary } from "@/lib/capture/serialize";

export const runtime = "nodejs";

/** GET /api/capture/recordings — newest-first filed call recordings. */
export async function GET(req: NextRequest) {
  const auth = await requireCaptureIdentity(req);
  if (auth instanceof NextResponse) return auth;

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 30, 100);
  const recordings = await listCallRecordings({ workspaceId: auth.workspaceId, limit });
  return NextResponse.json({ recordings: recordings.map(serializeRecordingSummary) });
}
