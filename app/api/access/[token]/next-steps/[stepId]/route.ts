import { NextRequest, NextResponse } from "next/server";
import { hashPartnerAccessToken } from "@/lib/partner-access-token.server";
import { completePartnerNextStep, uncompletePartnerNextStep } from "@/db/queries/partner-next-steps";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";

type Params = Promise<{ token: string; stepId: string }>;

async function resolveRoom(token: string) {
  const tokenHash = hashPartnerAccessToken(token);
  const [row] = await db
    .select({ id: schema.partnerRooms.id, workspaceId: schema.partnerRooms.workspaceId, status: schema.partnerRooms.status, expiresAt: schema.partnerRooms.expiresAt })
    .from(schema.partnerRooms)
    .where(eq(schema.partnerRooms.publicAccessTokenHash, tokenHash))
    .limit(1);
  if (!row || row.status === "revoked" || row.status === "paused") return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
  return row;
}

export async function PATCH(req: NextRequest, props: { params: Params }) {
  const { token, stepId } = await props.params;
  const room = await resolveRoom(token);
  if (!room) {
    return NextResponse.json({ error: "Room not found or access expired" }, { status: 404 });
  }

  // Verify step belongs to this room and is assigned to partner
  const [step] = await db
    .select()
    .from(schema.partnerNextSteps)
    .where(
      and(
        eq(schema.partnerNextSteps.id, stepId),
        eq(schema.partnerNextSteps.roomId, room.id),
      ),
    )
    .limit(1);

  if (!step) return NextResponse.json({ error: "Step not found" }, { status: 404 });

  let body: { complete?: boolean } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  if (body.complete === false && step.completedAt) {
    const updated = await uncompletePartnerNextStep({ workspaceId: room.workspaceId, stepId });
    return NextResponse.json(updated);
  }

  if (!step.completedAt) {
    const updated = await completePartnerNextStep({ workspaceId: room.workspaceId, roomId: room.id, stepId, completedBy: "partner" });
    return NextResponse.json(updated);
  }

  return NextResponse.json(step);
}
