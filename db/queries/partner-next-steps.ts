import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export type PartnerNextStep = typeof schema.partnerNextSteps.$inferSelect;

export async function listPartnerNextSteps(opts: {
  workspaceId: string;
  roomId: string;
}): Promise<PartnerNextStep[]> {
  return db
    .select()
    .from(schema.partnerNextSteps)
    .where(
      and(
        eq(schema.partnerNextSteps.workspaceId, opts.workspaceId),
        eq(schema.partnerNextSteps.roomId, opts.roomId),
      ),
    )
    .orderBy(asc(schema.partnerNextSteps.sortOrder), asc(schema.partnerNextSteps.createdAt));
}

export async function listPartnerNextStepsByRoom(opts: {
  roomId: string;
}): Promise<PartnerNextStep[]> {
  return db
    .select()
    .from(schema.partnerNextSteps)
    .where(eq(schema.partnerNextSteps.roomId, opts.roomId))
    .orderBy(asc(schema.partnerNextSteps.sortOrder), asc(schema.partnerNextSteps.createdAt));
}

export async function createPartnerNextStep(input: {
  workspaceId: string;
  roomId: string;
  text: string;
  assignedTo: string;
  dueAt: Date | null;
  sortOrder: number;
  createdByUser: string | null;
}): Promise<PartnerNextStep> {
  const [row] = await db
    .insert(schema.partnerNextSteps)
    .values(input)
    .returning();
  return row;
}

export async function completePartnerNextStep(opts: {
  workspaceId: string;
  roomId: string;
  stepId: string;
  completedBy: "owner" | "partner";
}): Promise<PartnerNextStep | null> {
  const now = new Date();
  const [row] = await db
    .update(schema.partnerNextSteps)
    .set({ completedAt: now, completedBy: opts.completedBy, updatedAt: now })
    .where(
      and(
        eq(schema.partnerNextSteps.id, opts.stepId),
        eq(schema.partnerNextSteps.roomId, opts.roomId),
        eq(schema.partnerNextSteps.workspaceId, opts.workspaceId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function uncompletePartnerNextStep(opts: {
  workspaceId: string;
  stepId: string;
}): Promise<PartnerNextStep | null> {
  const now = new Date();
  const [row] = await db
    .update(schema.partnerNextSteps)
    .set({ completedAt: null, completedBy: null, updatedAt: now })
    .where(
      and(
        eq(schema.partnerNextSteps.id, opts.stepId),
        eq(schema.partnerNextSteps.workspaceId, opts.workspaceId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function deletePartnerNextStep(opts: {
  workspaceId: string;
  stepId: string;
}): Promise<boolean> {
  const result = await db
    .delete(schema.partnerNextSteps)
    .where(
      and(
        eq(schema.partnerNextSteps.id, opts.stepId),
        eq(schema.partnerNextSteps.workspaceId, opts.workspaceId),
      ),
    )
    .returning({ id: schema.partnerNextSteps.id });
  return result.length > 0;
}
