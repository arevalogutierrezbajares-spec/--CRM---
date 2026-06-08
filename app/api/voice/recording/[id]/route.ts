import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { getCallRecording } from "@/db/queries/call-recordings";

/** Returns the full transcript (+ brief) for one recording, workspace-fenced. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const rec = await getCallRecording({ id, workspaceId: user.workspaceId });
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: rec.id,
    title: rec.title,
    brief: rec.brief,
    transcript: rec.transcript,
    durationSecs: rec.durationSecs,
    createdAt: rec.createdAt,
  });
}
