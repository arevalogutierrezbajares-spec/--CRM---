import { NextResponse, type NextRequest } from "next/server";
import { requireCaptureIdentity } from "@/lib/capture/api";
import { getProjectLinkById } from "@/db/queries/lines-of-business";
import { createSignedDownloadUrl } from "@/lib/project-files/storage";
import { canonicalMime, previewKind } from "@/lib/project-files/allowed-types";
import { renderMarkdownDocument } from "@/lib/project-files/render-markdown";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

/**
 * GET /api/capture/files/{id}/view
 *
 * Capture-token version of /api/materials/[id]/view so the macOS helper can
 * open HTML decks / Markdown with the correct Content-Type. Supabase signed
 * URLs force text/plain+nosniff on HTML, which shows raw source — never open
 * those directly for .html decks.
 *
 * Auth: Bearer agbcap_… (requireCaptureIdentity). Workspace-fenced via link row.
 */
export async function GET(req: NextRequest, props: { params: Params }) {
  const auth = await requireCaptureIdentity(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await props.params;
  const link = await getProjectLinkById({
    linkId: id,
    workspaceId: auth.workspaceId,
  });
  if (!link || link.kind !== "file" || !link.storagePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const signed = await createSignedDownloadUrl(link.storagePath);
  if (!signed.ok) {
    return NextResponse.json({ error: "Storage error" }, { status: 502 });
  }

  const upstream = await fetch(signed.url);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Object fetch failed" }, { status: 502 });
  }

  const filename = link.originalFilename ?? link.label ?? "";
  const kind = previewKind(filename);

  if (kind === "markdown") {
    const text = await upstream.text();
    const html = renderMarkdownDocument(text, link.label ?? filename);
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, max-age=120",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  }

  const contentType = canonicalMime(filename, "");
  // HTML decks: allow scripts in sandbox so presentations can run.
  const csp =
    kind === "html"
      ? "sandbox allow-scripts allow-popups allow-forms allow-modals"
      : "sandbox";

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=120",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": csp,
      // Help browser download with a sensible name when Save is used.
      "Content-Disposition": `inline; filename="${(filename || "file").replace(/"/g, "")}"`,
    },
  });
}
