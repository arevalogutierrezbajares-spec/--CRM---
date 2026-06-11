import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { getCallRecording } from "@/db/queries/call-recordings";
import { createSignedAudioUrl } from "@/lib/capture/storage";

/**
 * FR-CALL-ACC-3: in-app playback while audio is within the retention window.
 * 410 Gone after purge (UI shows "audio expired", transcript remains).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const rec = await getCallRecording({ id, workspaceId: user.workspaceId });
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (rec.audioPurgedAt || !rec.audioPath) {
    return NextResponse.json(
      { error: "Audio purged per retention policy" },
      { status: 410 },
    );
  }

  const signed = await createSignedAudioUrl(rec.audioPath, 60 * 10);
  if (!signed.ok) {
    return NextResponse.json({ error: signed.error }, { status: 502 });
  }
  return NextResponse.redirect(signed.url, 302);
}
