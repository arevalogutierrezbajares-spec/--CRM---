import { NextResponse, type NextRequest } from "next/server";
import { requireCaptureIdentity } from "@/lib/capture/api";
import { listProjectsForPicker } from "@/db/queries/items";

export const runtime = "nodejs";

/**
 * GET /api/capture/projects — the execution units (projects table). The
 * helper uses these as action-item targets and Town Hall `#project`
 * references (deep-linked as /projects/{id}). Returns `{ id, title }[]`.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCaptureIdentity(req);
  if (auth instanceof NextResponse) return auth;

  const projects = await listProjectsForPicker(auth.workspaceId);
  return NextResponse.json({ projects });
}
