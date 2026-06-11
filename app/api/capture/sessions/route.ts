import { NextRequest, NextResponse } from "next/server";
import { resolveCaptureToken } from "@/lib/capture/tokens";
import { createCaptureSession } from "@/db/queries/capture-sessions";
import { CAPTURE_SAMPLE_RATE, CAPTURE_CHANNELS } from "@/lib/capture/constants";

/**
 * Protocol §POST /api/capture/sessions — start a capture session.
 * Called once per recorded call, after the founder affirms the prompt.
 */
export async function POST(req: NextRequest) {
  const identity = await resolveCaptureToken(req.headers.get("authorization"));
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    startedAt?: string;
    sourceApp?: string | null;
    sampleRate?: number;
    channels?: number;
    format?: string;
    helperVersion?: string;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  // v1 accepts exactly one format (protocol §Audio format) — reject anything
  // else loudly rather than transcribe garbage.
  const sampleRate = body.sampleRate ?? CAPTURE_SAMPLE_RATE;
  const channels = body.channels ?? CAPTURE_CHANNELS;
  if (
    sampleRate !== CAPTURE_SAMPLE_RATE ||
    channels !== CAPTURE_CHANNELS ||
    (body.format !== undefined && body.format !== "wav-pcm16")
  ) {
    return NextResponse.json(
      { error: `Unsupported format — v1 requires wav-pcm16 ${CAPTURE_SAMPLE_RATE}Hz ${CAPTURE_CHANNELS}ch` },
      { status: 400 },
    );
  }

  const startedAt = body.startedAt ? new Date(body.startedAt) : new Date();
  if (Number.isNaN(startedAt.getTime())) {
    return NextResponse.json({ error: "Invalid startedAt" }, { status: 400 });
  }

  const sessionId = await createCaptureSession({
    workspaceId: identity.workspaceId,
    createdBy: identity.userId,
    startedAt,
    sourceApp: body.sourceApp ?? null,
    sampleRate,
    channels,
    helperVersion: body.helperVersion ?? null,
  });

  return NextResponse.json({ sessionId }, { status: 201 });
}
