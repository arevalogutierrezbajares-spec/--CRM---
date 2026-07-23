import { NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { getPresentation } from "@/db/queries/presentations";
import { createSignedDownloadUrl } from "@/lib/project-files/storage";

/**
 * Serve an HTML-deck presentation's bytes to a logged-in workspace member.
 *
 * Mirrors app/api/materials/[id]/view/route.ts: the presentation's `htmlUrl`
 * is a private Storage OBJECT PATH, never a URL the client should see. This
 * route resolves it server-side to a short-lived signed URL, fetches the
 * bytes, and re-serves them with the correct content-type — the client only
 * ever sees this internal, login-gated route (loaded inside a sandboxed
 * <iframe> by PresentationPlayer).
 *
 * Auth: requireUser() + workspace-scoped lookup. 404s (not 403) on missing,
 * wrong-workspace, or non-html presentations to avoid confirming existence.
 */
type Params = Promise<{ id: string }>;

export async function GET(_req: Request, props: { params: Params }) {
  const user = await requireUser();

  const { id } = await props.params;
  const pres = await getPresentation({ id, workspaceId: user.workspaceId });
  if (!pres || pres.kind !== "html" || !pres.htmlUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const signed = await createSignedDownloadUrl(pres.htmlUrl);
  if (!signed.ok) return NextResponse.json({ error: "Storage error" }, { status: 502 });

  const upstream = await fetch(signed.url);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Object fetch failed" }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      // Opaque-origin sandbox: the uploaded deck may run scripts, but never
      // with the app's origin/cookies — defense in depth alongside the
      // sandboxed <iframe> it's loaded into.
      "Content-Security-Policy": "sandbox allow-scripts allow-popups allow-forms",
    },
  });
}
