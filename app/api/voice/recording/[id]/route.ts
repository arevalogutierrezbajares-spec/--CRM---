import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import {
  getCallRecording,
  getContactName,
  updateCallRecording,
  deleteCallRecording,
} from "@/db/queries/call-recordings";
import { removeObjects } from "@/lib/capture/storage";
import { isUuid } from "@/lib/capture/validate";

/** Full recording detail, workspace-fenced (transcript, dialogue, audio state). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rec = await getCallRecording({ id, workspaceId: user.workspaceId });
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // FR-CALL-ATT-3: label the participant side with the matched contact's name.
  const contact = rec.contactId
    ? await getContactName({ id: rec.contactId, workspaceId: user.workspaceId })
    : null;

  return NextResponse.json({
    id: rec.id,
    title: rec.title,
    brief: rec.brief,
    transcript: rec.transcript,
    durationSecs: rec.durationSecs,
    createdAt: rec.createdAt,
    // Capture-module surface (FR-CALL-ACC-2/3, ATT-2/3, RET-2/5, OPS-4):
    utterances: rec.utterances ?? null,
    channels: rec.channels,
    sourceApp: rec.sourceApp,
    partial: rec.partial,
    suspectFlags: rec.suspectFlags ?? [],
    consentNote: rec.consentNote,
    contactId: rec.contactId,
    contactName: contact?.name ?? null,
    contactAmbiguous: rec.contactAmbiguous,
    hasAudio: Boolean(rec.audioPath) && !rec.audioPurgedAt,
    audioPurgeAt: rec.audioPurgeAt,
    audioPurgedAt: rec.audioPurgedAt,
  });
}

/** FR-CALL-DST-6 / RET-5: edit title, brief, consent note after filing. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rec = await getCallRecording({ id, workspaceId: user.workspaceId });
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    title?: string;
    brief?: string | null;
    consentNote?: string | null;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  await updateCallRecording({
    id,
    workspaceId: user.workspaceId,
    title: typeof body.title === "string" ? body.title.slice(0, 120) : undefined,
    brief: body.brief !== undefined ? body.brief : undefined,
    consentNote:
      body.consentNote !== undefined
        ? body.consentNote === null
          ? null
          : String(body.consentNote).slice(0, 500)
        : undefined,
  });
  return NextResponse.json({ ok: true });
}

/**
 * FR-CALL-ACC-6: permanently delete a recording — audio object first, then the
 * row (transcript, brief, utterances go with it). Confirmed client-side.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { deleted, audioPath } = await deleteCallRecording({
    id,
    workspaceId: user.workspaceId,
  });
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (audioPath) await removeObjects([audioPath]);
  return NextResponse.json({ ok: true });
}
