import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { revokeCaptureToken } from "@/db/queries/capture-tokens";

/** Revoke a Helper token (NFR-CALL-SEC-2) — takes effect on its next request. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const revoked = await revokeCaptureToken({ id, workspaceId: user.workspaceId });
  if (!revoked) {
    return NextResponse.json(
      { error: "Not found or already revoked" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
