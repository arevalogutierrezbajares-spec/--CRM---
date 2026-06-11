import { NextRequest, NextResponse } from "next/server";
import { resolveCaptureToken } from "@/lib/capture/tokens";
import { getWorkspaceRetentionDays } from "@/db/queries/capture-sessions";

/** Helper config test: validates the token and returns workspace context. */
export async function GET(req: NextRequest) {
  const identity = await resolveCaptureToken(req.headers.get("authorization"));
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const retentionDays = await getWorkspaceRetentionDays(identity.workspaceId);
  return NextResponse.json({
    ok: true,
    workspaceId: identity.workspaceId,
    userId: identity.userId,
    retentionDays,
  });
}
