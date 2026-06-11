import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { createCallRecording } from "@/db/queries/call-recordings";
import { fileCallTranscript } from "@/lib/capture/file-call";

/**
 * Live-mic recorder save flow. The filing core (brief/note/action items/
 * contact match) lives in lib/capture/file-call.ts, shared with the Helper
 * capture pipeline — this route just persists the transcript durable-first
 * and delegates.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = (await req.json().catch(() => null)) as {
    transcript?: string;
    durationSecs?: number;
    contactName?: string;
    language?: string;
  } | null;

  const transcript = (payload?.transcript ?? "").trim();
  if (!transcript) {
    return NextResponse.json({ error: "transcript required" }, { status: 400 });
  }

  // 0. PERSIST THE TRANSCRIPT FIRST — before any LLM call or contact matching.
  // This is the durability guarantee: a recording is never lost just because
  // extraction fails or no contact matches. Everything below only enriches it.
  const recordingId = await createCallRecording({
    workspaceId: user.workspaceId,
    createdBy: user.id,
    transcript,
    durationSecs: payload?.durationSecs ?? null,
    language: payload?.language ?? null,
  });

  const result = await fileCallTranscript({
    workspaceId: user.workspaceId,
    userId: user.id,
    recordingId,
    transcript,
    durationSecs: payload?.durationSecs ?? null,
    contactName: payload?.contactName ?? null,
    spendRoute: "voice:call:file",
  });

  return NextResponse.json({
    ok: true,
    recordingId,
    title: result.title,
    brief: result.brief,
    actionItemCount: result.actionItemCount,
    contact: result.contact,
    contactQueryMatched: result.contact !== null,
    contactAmbiguous: result.contactAmbiguous,
  });
}
