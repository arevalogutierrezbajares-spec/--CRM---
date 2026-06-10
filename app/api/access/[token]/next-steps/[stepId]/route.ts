import { NextRequest, NextResponse } from "next/server";
import { completePartnerNextStep, uncompletePartnerNextStep } from "@/db/queries/partner-next-steps";
import { resolvePartnerRoomByToken } from "@/db/queries/partner-access";
import { isPartnerRoomUnlocked } from "@/lib/partner-room-gate.server";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";

type Params = Promise<{ token: string; stepId: string }>;

export async function PATCH(req: NextRequest, props: { params: Params }) {
  const { token, stepId } = await props.params;
  const room = await resolvePartnerRoomByToken(token).catch(() => null);
  if (!room) {
    return NextResponse.json({ error: "Room not found or access expired" }, { status: 404 });
  }
  if (!(await isPartnerRoomUnlocked(room))) {
    return NextResponse.json({ error: "Room is locked" }, { status: 401 });
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
  // Visitors may only toggle steps assigned to them — never owner-only steps.
  if (step.assignedTo !== "partner" && step.assignedTo !== "both") {
    return NextResponse.json({ error: "Step not found" }, { status: 404 });
  }

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
