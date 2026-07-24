import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCaptureIdentity, readJson } from "@/lib/capture/api";
import {
  getCallRecording,
  getContactName,
  updateCallRecording,
} from "@/db/queries/call-recordings";
import { serializeRecordingDetail } from "@/lib/capture/serialize";
import { renderThemedBrief, type ThemedDoc } from "@/lib/capture/themed-doc";
import { strike, type StrikeTarget } from "@/lib/capture/themed-doc-mutate";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 });
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

/**
 * POST /api/capture/recordings/{id}/strike — suppress an AI contribution.
 *
 * Body: { target: "theme", themeKey } nulls that theme's ai block; or
 * { target: "callSentence" } nulls the call sentence. Re-renders the brief,
 * persists themed_doc + brief. Workspace-fenced; unknown id ⇒ 404, unknown
 * theme ⇒ 400.
 */
export async function POST(req: NextRequest, props: { params: Params }) {
  const auth = await requireCaptureIdentity(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await props.params;
  if (!z.string().uuid().safeParse(id).success) return notFound();

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const b = body as Record<string, unknown>;

  let target: StrikeTarget;
  if (b.target === "callSentence") {
    target = { kind: "callSentence" };
  } else if (b.target === "theme" && typeof b.themeKey === "string" && b.themeKey) {
    target = { kind: "theme", themeKey: b.themeKey };
  } else {
    return bad("target must be 'callSentence', or 'theme' with a themeKey");
  }

  const rec = await getCallRecording({ id, workspaceId: auth.workspaceId });
  if (!rec) return notFound();
  const doc = rec.themedDoc as ThemedDoc | null;
  if (!doc || !Array.isArray(doc.themes)) {
    return bad("recording has no themed document");
  }

  const next = strike(doc, target);
  if (!next) return bad("unknown theme");

  const brief = renderThemedBrief(next);
  await updateCallRecording({
    id,
    workspaceId: auth.workspaceId,
    themedDoc: next,
    brief,
  });

  // Structured suppression signal. TODO (Slice 3): persist to the
  // suppression-learning store so struck AI patterns stop recurring.
  console.log(
    JSON.stringify({
      evt: "capture.strike",
      workspaceId: auth.workspaceId,
      recordingId: id,
      target: target.kind === "theme" ? `theme:${target.themeKey}` : "callSentence",
    }),
  );

  const contact = rec.contactId
    ? await getContactName({ id: rec.contactId, workspaceId: auth.workspaceId })
    : null;
  return NextResponse.json({
    recording: serializeRecordingDetail(
      { ...rec, themedDoc: next, brief },
      contact?.name ?? null,
    ),
  });
}
