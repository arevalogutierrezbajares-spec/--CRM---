import { NextRequest, NextResponse } from "next/server";
import { resolveCaptureToken } from "@/lib/capture/tokens";
import {
  getCaptureSession,
  abandonSession,
  updateCaptureSession,
} from "@/db/queries/capture-sessions";
import { listSessionChunkPaths, removeObjects } from "@/lib/capture/storage";
import { isUuid } from "@/lib/capture/validate";

/**
 * Protocol §DELETE — abandon a session (decline-after-start / off-the-record).
 * Atomic: the status transition (recording/failed → abandoned) happens FIRST
 * and only succeeds if no finalize has already claimed the session. This closes
 * the race where an in-flight finalize would otherwise resurrect off-the-record
 * audio into a filed recording (FR-CALL-TRG-7). Chunks are deleted only after
 * the transition is won.
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
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Unknown session" }, { status: 404 });
  }

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

  // Atomic transition first. If a finalize already claimed the session
  // (`finalizing`), this matches nothing and we refuse — the helper must wait
  // for finalize to complete and then delete the recording.
  const won = await abandonSession({ id, workspaceId: identity.workspaceId });
  if (!won) {
    return NextResponse.json(
      { error: "Finalize in progress — cannot abandon" },
      { status: 409 },
    );
  }

  // Now safe to delete chunks: no finalize can be reading them (we hold the
  // abandoned status, and finalize only runs from `recording`/`finalizing`).
  const chunkPaths = await listSessionChunkPaths(identity.workspaceId, id);
  const removed = await removeObjects(chunkPaths);
  if (removed.failed.length > 0) {
    // Objects left behind get reaped by the daily purge cron; record it.
    await updateCaptureSession({
      id,
      workspaceId: identity.workspaceId,
      patch: {
        error: `abandon: ${removed.failed.length} chunk objects failed to delete (purge cron will reap)`,
      },
    }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
