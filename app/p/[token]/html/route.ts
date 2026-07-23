import { NextResponse } from "next/server";
import { getPresentationByShareToken } from "@/db/queries/presentations";
import { createSignedDownloadUrl } from "@/lib/project-files/storage";

/**
 * Serve an HTML-deck presentation's bytes to a public share-link visitor.
 *
 * Mirrors app/access/[token]/item/[itemId]/route.ts. getPresentationByShareToken
 * already AND-gates on shareEnabled=true AND visibility='public' — reused
 * as-is, not re-implemented here. `htmlUrl` is a private Storage OBJECT PATH;
 * this route resolves it server-side to a short-lived signed URL and
 * re-serves the bytes, so the raw signed Storage URL never reaches the
 * client (loaded inside a sandboxed <iframe> by PresentationPlayer).
 */
type Params = Promise<{ token: string }>;

export async function GET(_req: Request, props: { params: Params }) {
  const { token } = await props.params;
  const pres = await getPresentationByShareToken(token).catch(() => null);
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
      "Content-Security-Policy": "sandbox allow-scripts allow-popups allow-forms",
    },
  });
}
