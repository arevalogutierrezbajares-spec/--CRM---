import { NextResponse } from "next/server";
import {
  getPublicPartnerShareByToken,
  recordPublicPartnerShareEvent,
} from "@/db/queries/partner-access";
import { createSignedDownloadUrl } from "@/lib/project-files/storage";
import { canonicalMime } from "@/lib/project-files/allowed-types";
import { isPartnerRoomUnlocked } from "@/lib/partner-room-gate.server";

/**
 * Render a shared file (esp. HTML decks) inline for an external client, with the
 * CORRECT Content-Type. Supabase serves uploads as text/plain, so a shared deck
 * would otherwise download/show as source. We re-serve the bytes with the type
 * derived from the storage path's extension.
 *
 * Auth: the room token must grant access to this share (active, not revoked /
 * expired) — viewing is the baseline of a share, so no `download` permission is
 * required (a "view only" deck must still be viewable). Safety: a CSP `sandbox`
 * directive keeps the HTML in an opaque origin (no app session, no cookies).
 */
type Params = Promise<{ token: string; shareId: string }>;

export async function GET(_: Request, { params }: { params: Params }) {
  const { token, shareId } = await params;
  const row = await getPublicPartnerShareByToken({ token, shareId }).catch(() => null);
  if (!row || row.share.kindSnapshot !== "file" || !row.storagePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await isPartnerRoomUnlocked(row.room))) {
    return NextResponse.json({ error: "Room is locked" }, { status: 401 });
  }

  const signed = await createSignedDownloadUrl(row.storagePath);
  if (!signed.ok) {
    return NextResponse.json({ error: "File unavailable" }, { status: 503 });
  }

  const upstream = await fetch(signed.url);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Object fetch failed" }, { status: 502 });
  }

  await recordPublicPartnerShareEvent({
    workspaceId: row.room.workspaceId,
    roomId: row.room.id,
    shareId: row.share.id,
    contactId: row.share.contactId,
    event: "viewed",
  }).catch(() => {});

  const contentType = canonicalMime(row.storagePath, "");
  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox allow-scripts allow-popups allow-forms",
    },
  });
}
