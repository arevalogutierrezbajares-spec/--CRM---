import { NextResponse, type NextRequest } from "next/server";
import { requireCaptureIdentity } from "@/lib/capture/api";
import { listWorkspaceMembers } from "@/db/queries/team";

export const runtime = "nodejs";

/**
 * GET /api/capture/members — workspace roster for the helper's @mention picker.
 * Returns `{ id, name }[]`.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCaptureIdentity(req);
  if (auth instanceof NextResponse) return auth;

  const members = await listWorkspaceMembers(auth.workspaceId);
  return NextResponse.json({
    members: members.map((m) => ({ id: m.userId, name: m.displayName })),
  });
}
