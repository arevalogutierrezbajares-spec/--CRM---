import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCaptureIdentity } from "@/lib/capture/api";
import { getCallRecording, getContactName } from "@/db/queries/call-recordings";
import { serializeRecordingDetail } from "@/lib/capture/serialize";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

/**
 * GET /api/capture/recordings/{id} — full recording detail (transcript, brief,
 * utterances as stored) for the helper's in-app browser. Workspace-fenced by
 * the query; unknown/foreign ids 404.
 */
export async function GET(req: NextRequest, props: { params: Params }) {
  const auth = await requireCaptureIdentity(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await props.params;
  // Non-uuid ids would error at the uuid column — treat them as not found.
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const rec = await getCallRecording({ id, workspaceId: auth.workspaceId });
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const contact = rec.contactId
    ? await getContactName({ id: rec.contactId, workspaceId: auth.workspaceId })
    : null;
  return NextResponse.json({
    recording: serializeRecordingDetail(rec, contact?.name ?? null),
  });
}
