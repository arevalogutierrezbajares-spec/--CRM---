import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { getProjectLinkById } from "@/db/queries/lines-of-business";
import { createSignedDownloadUrl } from "@/lib/project-files/storage";
import { canonicalMime } from "@/lib/project-files/allowed-types";

/**
 * Serve a stored project file (esp. HTML decks) with the CORRECT Content-Type.
 *
 * Supabase Storage serves uploaded objects as text/plain (+ nosniff) on the
 * signed-upload path, so HTML decks render as raw source. This route reads the
 * object server-side (service-role signed URL) and re-serves the bytes with the
 * content-type derived from the filename, so a deck renders as a page.
 *
 * Auth: requires the current user; the file is scoped to their workspace.
 * Safety: a CSP `sandbox` directive forces the response into an opaque origin
 * even on direct navigation, so user-authored HTML can't touch the app session.
 * It is additionally rendered inside a sandboxed <iframe> (present + preview).
 */
type Params = Promise<{ id: string }>;

export async function GET(_req: Request, props: { params: Params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await props.params;
  const link = await getProjectLinkById({ linkId: id, workspaceId: user.workspaceId });
  if (!link || link.kind !== "file" || !link.storagePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const signed = await createSignedDownloadUrl(link.storagePath);
  if (!signed.ok) return NextResponse.json({ error: "Storage error" }, { status: 502 });

  const upstream = await fetch(signed.url);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Object fetch failed" }, { status: 502 });
  }

  const contentType = canonicalMime(link.originalFilename ?? link.label ?? "", "");

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      // Opaque-origin sandbox: HTML decks may run scripts, but never with the
      // app's origin/cookies — defense in depth alongside the iframe sandbox.
      "Content-Security-Policy": "sandbox allow-scripts allow-popups allow-forms",
    },
  });
}
