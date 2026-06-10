import { NextResponse } from "next/server";
import {
  getPublicPartnerShareByToken,
  recordPublicPartnerShareEvent,
} from "@/db/queries/partner-access";
import { createSignedDownloadUrl } from "@/lib/project-files/storage";
import { isPartnerRoomUnlocked } from "@/lib/partner-room-gate.server";

type Params = Promise<{ token: string; shareId: string }>;

export async function GET(_: Request, { params }: { params: Params }) {
  const { token, shareId } = await params;
  const row = await getPublicPartnerShareByToken({ token, shareId }).catch(
    () => null,
  );
  if (!row || !row.share.permissions.includes("download") || !row.storagePath) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await isPartnerRoomUnlocked(row.room))) {
    return NextResponse.json({ error: "Room is locked" }, { status: 401 });
  }

  const signed = await createSignedDownloadUrl(row.storagePath);
  if (!signed.ok) {
    return NextResponse.json({ error: "File unavailable" }, { status: 503 });
  }

  await recordPublicPartnerShareEvent({
    workspaceId: row.room.workspaceId,
    roomId: row.room.id,
    shareId: row.share.id,
    contactId: row.share.contactId,
    event: "downloaded",
  }).catch(() => {});

  return NextResponse.redirect(signed.url);
}
