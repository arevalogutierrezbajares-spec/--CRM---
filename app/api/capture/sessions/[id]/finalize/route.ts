import { NextRequest, NextResponse } from "next/server";
import { resolveCaptureToken } from "@/lib/capture/tokens";
import {
  getCaptureSession,
  claimSessionForFinalize,
  reclaimFailedSession,
} from "@/db/queries/capture-sessions";
import { getCallRecording, getContactName } from "@/db/queries/call-recordings";
import { finalizeSession } from "@/lib/capture/finalize";
import { isUuid, MAX_TOTAL_CHUNKS } from "@/lib/capture/validate";

export const maxDuration = 800; // long calls: assembly + transcription + filing

/**
 * Protocol §POST finalize — call ended; assemble, transcribe, file.
 * Idempotent: a second finalize of a `filed` session returns the existing
 * recording. 409 + {missing} tells the helper which chunk seqs to re-upload.
 */
export async function POST(
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
  const body = (await req.json().catch(() => null)) as {
    endedAt?: string;
    durationSecs?: number;
    totalChunks?: number;
    partial?: boolean;
    contactName?: string | null;
  } | null;
  if (!body || !Number.isInteger(body.totalChunks) || body.totalChunks! < 1) {
    return NextResponse.json(
      { error: "totalChunks (>=1) required" },
      { status: 400 },
    );
  }
  if (body.totalChunks! > MAX_TOTAL_CHUNKS) {
    return NextResponse.json(
      { error: `totalChunks exceeds ${MAX_TOTAL_CHUNKS}` },
      { status: 400 },
    );
  }

  const session = await getCaptureSession({ id, workspaceId: identity.workspaceId });
  if (!session) {
    return NextResponse.json({ error: "Unknown session" }, { status: 404 });
  }

  // Idempotent retry of an already-filed session — reconstruct the SAME
  // response shape as the first finalize, including the attached contact, so
  // the helper's retry path isn't handed a spurious null (correctness finding).
  if (session.status === "filed" && session.recordingId) {
    const rec = await getCallRecording({
      id: session.recordingId,
      workspaceId: identity.workspaceId,
    });
    let contact: { id: string; name: string } | null = null;
    if (rec?.contactId) {
      const c = await getContactName({
        id: rec.contactId,
        workspaceId: identity.workspaceId,
      });
      if (c) contact = c;
    }
    return NextResponse.json({
      ok: true,
      recordingId: session.recordingId,
      title: rec?.title ?? "Call",
      brief: rec?.brief ?? "",
      actionItemCount: rec?.actionItemCount ?? 0,
      contact,
      contactAmbiguous: rec?.contactAmbiguous ?? false,
      suspectFlags: rec?.suspectFlags ?? [],
      partial: rec?.partial ?? false,
      alreadyFiled: true,
    });
  }
  if (session.status === "abandoned") {
    return NextResponse.json({ error: "Session abandoned" }, { status: 409 });
  }
  if (session.status === "finalizing") {
    return NextResponse.json(
      { error: "Finalize already in progress" },
      { status: 409 },
    );
  }

  // Exactly-once claim (recording→finalizing, or failed→finalizing for retry).
  const claimed =
    session.status === "recording"
      ? await claimSessionForFinalize({ id, workspaceId: identity.workspaceId })
      : await reclaimFailedSession({ id, workspaceId: identity.workspaceId });
  if (!claimed) {
    return NextResponse.json(
      { error: "Finalize already in progress" },
      { status: 409 },
    );
  }

  const endedAt = body.endedAt ? new Date(body.endedAt) : new Date();
  const outcome = await finalizeSession({
    session,
    founderLabel: identity.displayName?.split(/\s+/)[0] ?? "Founder",
    endedAt: Number.isNaN(endedAt.getTime()) ? new Date() : endedAt,
    durationSecs:
      typeof body.durationSecs === "number" ? Math.round(body.durationSecs) : null,
    totalChunks: body.totalChunks!,
    partial: body.partial === true,
    contactName: body.contactName ?? null,
  });

  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.error, missing: outcome.missing },
      { status: outcome.status },
    );
  }
  return NextResponse.json({
    ok: true,
    recordingId: outcome.recordingId,
    title: outcome.result.title,
    brief: outcome.result.brief,
    actionItemCount: outcome.result.actionItemCount,
    contact: outcome.result.contact,
    contactAmbiguous: outcome.result.contactAmbiguous,
    suspectFlags: outcome.suspectFlags,
    partial: outcome.partial,
  });
}
