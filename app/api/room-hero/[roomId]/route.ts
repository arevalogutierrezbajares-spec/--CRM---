import { NextRequest, NextResponse } from "next/server";
import { getRoomHeroImagePath } from "@/db/queries/partner-access";
import { createSignedDownloadUrl } from "@/lib/project-files/storage";
import { canonicalMime } from "@/lib/project-files/allowed-types";

type Params = Promise<{ roomId: string }>;

/**
 * Public: stream a room's generated hero image (background art shown in
 * public rooms — same exposure rationale as /api/contact-logo). The room id
 * is an unguessable uuid and the response reveals nothing but scenery.
 */
export async function GET(_: NextRequest, props: { params: Params }) {
  const { roomId } = await props.params;
  if (!/^[0-9a-f-]{36}$/.test(roomId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const path = await getRoomHeroImagePath(roomId).catch(() => null);
  if (!path) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const signed = await createSignedDownloadUrl(path);
  if (!signed.ok) {
    return NextResponse.json({ error: "Unavailable" }, { status: 503 });
  }
  const upstream = await fetch(signed.url);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 });
  }
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": canonicalMime(path, "image/jpeg"),
      // The URL carries a ?v= version — replacements land on a fresh URL.
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
