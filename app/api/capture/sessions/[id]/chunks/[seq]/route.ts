import { NextRequest, NextResponse } from "next/server";
import { resolveCaptureToken } from "@/lib/capture/tokens";
import {
  getCaptureSession,
  recordChunkHeartbeat,
} from "@/db/queries/capture-sessions";
import { putObject } from "@/lib/capture/storage";
import { parseWavHeader } from "@/lib/capture/wav";
import { chunkObjectPath, MAX_CHUNK_BYTES } from "@/lib/capture/constants";
import { isUuid } from "@/lib/capture/validate";

/**
 * Protocol §PUT chunks/{seq} — incremental upload during the call
 * (FR-CALL-TRX-1). Idempotent: re-uploading a seq overwrites it, which is what
 * makes helper retries safe.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; seq: string }> },
) {
  const identity = await resolveCaptureToken(req.headers.get("authorization"));
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, seq: seqRaw } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Unknown session" }, { status: 404 });
  }
  const seq = Number(seqRaw);
  if (!Number.isInteger(seq) || seq < 0 || seq > 100_000) {
    return NextResponse.json({ error: "Invalid seq" }, { status: 400 });
  }

  const session = await getCaptureSession({ id, workspaceId: identity.workspaceId });
  if (!session) {
    return NextResponse.json({ error: "Unknown session" }, { status: 404 });
  }
  if (session.status !== "recording") {
    // failed sessions may still re-upload missing chunks before finalize retry
    if (session.status !== "failed") {
      return NextResponse.json(
        { error: `Session is ${session.status}` },
        { status: 409 },
      );
    }
  }

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length === 0) {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }
  if (bytes.length > MAX_CHUNK_BYTES) {
    return NextResponse.json({ error: "Chunk too large" }, { status: 413 });
  }
  const info = parseWavHeader(bytes);
  if (
    !info ||
    info.sampleRate !== session.sampleRate ||
    info.channels !== session.channels
  ) {
    return NextResponse.json(
      { error: "Chunk is not a valid WAV in the session's format" },
      { status: 400 },
    );
  }

  const path = chunkObjectPath(identity.workspaceId, id, seq);
  const put = await putObject(path, bytes);
  if (!put.ok) {
    return NextResponse.json({ error: put.error }, { status: 502 });
  }

  await recordChunkHeartbeat({ id, workspaceId: identity.workspaceId, seq });
  return NextResponse.json({ ok: true, bytes: bytes.length });
}
