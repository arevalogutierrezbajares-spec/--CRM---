import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/current-user";

const { workspaces } = schema;

/**
 * FR-CALL-RET-1: founder-configurable audio retention window (days) and the
 * transcript-only switch (store call audio in the bucket at all). Each field is
 * optional — the UI patches whichever changed.
 */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    retentionDays?: number;
    storeCallAudio?: boolean;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const patch: { callAudioRetentionDays?: number; storeCallAudio?: boolean } = {};

  if (body.retentionDays !== undefined) {
    const days = body.retentionDays;
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return NextResponse.json(
        { error: "retentionDays must be an integer between 1 and 365" },
        { status: 400 },
      );
    }
    patch.callAudioRetentionDays = days;
  }

  if (body.storeCallAudio !== undefined) {
    if (typeof body.storeCallAudio !== "boolean") {
      return NextResponse.json(
        { error: "storeCallAudio must be a boolean" },
        { status: 400 },
      );
    }
    patch.storeCallAudio = body.storeCallAudio;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await db
    .update(workspaces)
    .set(patch)
    .where(eq(workspaces.id, user.workspaceId));
  return NextResponse.json({ ok: true, ...patch });
}
