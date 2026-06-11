import { NextRequest, NextResponse } from "next/server";
import { resolveCaptureToken } from "@/lib/capture/tokens";
import {
  getCaptureSession,
  updateCaptureSession,
} from "@/db/queries/capture-sessions";
import { listSessionChunkPaths, removeObjects } from "@/lib/capture/storage";

/**
 * Protocol §DELETE — abandon a session (decline-after-start / off-the-record).
 * Deletes every uploaded chunk; zero artifacts persist (FR-CALL-TRG-7).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const identity = await resolveCaptureToken(req.headers.get("authorization"));
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const session = await getCaptureSession({ id, workspaceId: identity.workspaceId });
  if (!session) {
    return NextResponse.json({ error: "Unknown session" }, { status: 404 });
  }
  if (session.status === "filed") {
    // Too late to abandon — the founder deletes the recording in the CRM
    // instead (FR-CALL-ACC-6), which is an explicit, confirmed action.
    return NextResponse.json(
      { error: "Already filed — delete the recording instead" },
      { status: 409 },
    );
  }

  const chunkPaths = await listSessionChunkPaths(identity.workspaceId, id);
  const removed = await removeObjects(chunkPaths);
  await updateCaptureSession({
    id,
    workspaceId: identity.workspaceId,
    patch: {
      status: "abandoned",
      error:
        removed.failed.length > 0
          ? `abandon: ${removed.failed.length} chunk objects failed to delete (purge cron will reap)`
          : null,
    },
  });
  return NextResponse.json({ ok: true });
}
