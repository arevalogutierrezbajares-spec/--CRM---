import { NextResponse } from "next/server";
import {
  getPublicPartnerShareByToken,
  recordPublicPartnerShareEvent,
} from "@/db/queries/partner-access";

type Params = Promise<{ token: string; shareId: string }>;

export async function GET(_: Request, { params }: { params: Params }) {
  const { token, shareId } = await params;
  const row = await getPublicPartnerShareByToken({ token, shareId }).catch(
    () => null,
  );
  const target = row?.share.urlSnapshot ?? row?.url;
  if (!row || !target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await recordPublicPartnerShareEvent({
    workspaceId: row.room.workspaceId,
    roomId: row.room.id,
    shareId: row.share.id,
    contactId: row.share.contactId,
    event: "viewed",
  }).catch(() => {});

  return NextResponse.redirect(target);
}
