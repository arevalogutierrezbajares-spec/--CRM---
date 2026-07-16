import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import {
  getCallRecording,
  getContactName,
  updateCallRecording,
  deleteCallRecording,
} from "@/db/queries/call-recordings";
import { getMeetingSummary } from "@/db/queries/meetings";
import { removeObjects } from "@/lib/capture/storage";
import { isUuid } from "@/lib/capture/validate";
import {
  rebuildDialogue,
  type DialogueUtterance,
} from "@/lib/capture/rebuild-dialogue";
import { isInPersonMeetingSource } from "@/lib/capture/finalize";
import { claudeChat } from "@/lib/anthropic";

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

  // The meeting this call was filed as (so the detail view can link to it).
  const meeting = rec.meetingId
    ? await getMeetingSummary({ id: rec.meetingId, workspaceId: user.workspaceId })
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
    speakerMap: rec.speakerMap ?? null,
    transcriptEngine: rec.transcriptEngine ?? null,
    channels: rec.channels,
    sourceApp: rec.sourceApp,
    partial: rec.partial,
    suspectFlags: rec.suspectFlags ?? [],
    consentNote: rec.consentNote,
    contactId: rec.contactId,
    contactName: contact?.name ?? null,
    contactAmbiguous: rec.contactAmbiguous,
    meetingId: meeting?.id ?? null,
    meetingTitle: meeting?.title ?? null,
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
    speakerMap?: Record<string, string> | null;
    refile?: boolean;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  let transcript: string | undefined;
  let speakerMap: Record<string, string> | null | undefined;
  if (body.speakerMap !== undefined) {
    const cleaned: Record<string, string> = {};
    if (body.speakerMap && typeof body.speakerMap === "object") {
      for (const [k, v] of Object.entries(body.speakerMap)) {
        const key = String(k).slice(0, 64);
        const name = String(v ?? "").trim().slice(0, 120);
        if (key && name) cleaned[key] = name;
      }
    }
    speakerMap = Object.keys(cleaned).length ? cleaned : null;
    const utts = (rec.utterances ?? []) as DialogueUtterance[];
    if (utts.length > 0) {
      const inPerson = isInPersonMeetingSource(rec.sourceApp);
      transcript = rebuildDialogue(utts, {
        founder: inPerson ? "Room" : "You",
        participant: "Participant",
        speakerMap: cleaned,
      });
    }
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
    speakerMap,
    transcript,
  });

  let refileBrief: string | undefined;
  let refileTitle: string | undefined;
  if (body.refile === true && transcript) {
    // Light re-file: refresh title/brief only — no new meeting/action items.
    try {
      const chat = await claudeChat({
        model: "claude-haiku-4-5",
        system:
          "Summarize this speaker-labeled transcript. Reply with JSON only: " +
          '{"title":"3-8 words","brief_markdown":"**TL;DR:** …"}. Same language as transcript.',
        prompt: transcript.slice(0, 24000),
        maxTokens: 800,
        spend: {
          workspaceId: user.workspaceId,
          userId: user.id,
          direction: "out",
          payload: { route: "voice:recording:refile", chars: transcript.length },
          trackUsage: true,
        },
      });
      if (chat.ok) {
        const m = chat.text.match(/\{[\s\S]*\}/);
        if (m) {
          const parsed = JSON.parse(m[0]) as {
            title?: string;
            brief_markdown?: string;
          };
          refileTitle = (parsed.title || "").slice(0, 120) || undefined;
          refileBrief = parsed.brief_markdown || chat.text;
        } else {
          refileBrief = chat.text;
        }
        await updateCallRecording({
          id,
          workspaceId: user.workspaceId,
          title: refileTitle,
          brief: refileBrief ?? null,
        });
      }
    } catch (e) {
      return NextResponse.json(
        {
          ok: true,
          transcript: transcript ?? undefined,
          refileError: String(e).slice(0, 200),
        },
        { status: 200 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    transcript: transcript ?? undefined,
    title: refileTitle,
    brief: refileBrief,
  });
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
