import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/current-user";

const { workspaces } = schema;

/** FR-CALL-RET-1: founder-configurable audio retention window (days). */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    retentionDays?: number;
  } | null;
  const days = body?.retentionDays;
  if (!Number.isInteger(days) || days! < 1 || days! > 365) {
    return NextResponse.json(
      { error: "retentionDays must be an integer between 1 and 365" },
      { status: 400 },
    );
  }

  await db
    .update(workspaces)
    .set({ callAudioRetentionDays: days! })
    .where(eq(workspaces.id, user.workspaceId));
  return NextResponse.json({ ok: true, retentionDays: days });
}
