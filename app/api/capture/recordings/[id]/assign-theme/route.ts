import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCaptureIdentity, readJson } from "@/lib/capture/api";
import {
  getCallRecording,
  getContactName,
  updateCallRecording,
  replaceCallThemeFacets,
} from "@/db/queries/call-recordings";
import { serializeRecordingDetail } from "@/lib/capture/serialize";
import {
  renderThemedBrief,
  facetsFromThemedDoc,
  type ThemedDoc,
} from "@/lib/capture/themed-doc";
import { assignEvidence, type AssignTarget } from "@/lib/capture/themed-doc-mutate";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 });
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

/**
 * PATCH /api/capture/recordings/{id}/assign-theme — re-file a stray marker.
 *
 * Body: { tSecs, type: "note"|"flag", themeKey?, newTheme?: { label } } with
 * EXACTLY ONE of themeKey / newTheme. Locates the evidence item in the themed
 * document's unfiled bucket (or any theme, for a re-file), moves it into the
 * target theme (creating a live theme from newTheme.label when needed),
 * recomputes agenda coverage, re-renders the brief, persists themed_doc + brief,
 * and rebuilds theme facets. Workspace-fenced; unknown id ⇒ 404.
 */
export async function PATCH(req: NextRequest, props: { params: Params }) {
  const auth = await requireCaptureIdentity(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await props.params;
  if (!z.string().uuid().safeParse(id).success) return notFound();

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const b = body as Record<string, unknown>;

  const tSecs = typeof b.tSecs === "number" ? b.tSecs : Number(b.tSecs);
  const type = b.type;
  if (!Number.isFinite(tSecs) || tSecs < 0 || (type !== "note" && type !== "flag")) {
    return bad("tSecs (>=0) and type ('note'|'flag') required");
  }
  const hasThemeKey = typeof b.themeKey === "string" && b.themeKey.length > 0;
  const newTheme = b.newTheme as { label?: unknown } | undefined;
  const hasNewTheme =
    !!newTheme && typeof newTheme === "object" && typeof newTheme.label === "string";
  // Exactly one of themeKey / newTheme.
  if (hasThemeKey === hasNewTheme) {
    return bad("exactly one of themeKey / newTheme required");
  }

  const rec = await getCallRecording({ id, workspaceId: auth.workspaceId });
  if (!rec) return notFound();
  const doc = rec.themedDoc as ThemedDoc | null;
  if (!doc || !Array.isArray(doc.themes)) {
    return bad("recording has no themed document");
  }

  const target: AssignTarget = hasThemeKey
    ? { kind: "existing", themeKey: b.themeKey as string }
    : { kind: "new", label: newTheme!.label as string };

  const next = assignEvidence(doc, { tSecs, type }, target);
  if (!next) return bad("evidence item not found or target unusable");

  const brief = renderThemedBrief(next);
  await updateCallRecording({
    id,
    workspaceId: auth.workspaceId,
    themedDoc: next,
    brief,
  });
  await replaceCallThemeFacets({
    workspaceId: auth.workspaceId,
    callId: id,
    facets: facetsFromThemedDoc(next),
  });

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
