import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export type PartnerUpload = typeof schema.partnerUploads.$inferSelect;

export async function listPartnerUploads(opts: {
  workspaceId: string;
  roomId: string;
}): Promise<PartnerUpload[]> {
  return db
    .select()
    .from(schema.partnerUploads)
    .where(
      and(
        eq(schema.partnerUploads.workspaceId, opts.workspaceId),
        eq(schema.partnerUploads.roomId, opts.roomId),
      ),
    )
    .orderBy(desc(schema.partnerUploads.createdAt));
}

export async function listPartnerUploadsByRoom(opts: {
  roomId: string;
}): Promise<PartnerUpload[]> {
  return db
    .select()
    .from(schema.partnerUploads)
    .where(eq(schema.partnerUploads.roomId, opts.roomId))
    .orderBy(desc(schema.partnerUploads.createdAt));
}

export async function createPartnerUpload(input: {
  workspaceId: string;
  roomId: string;
  storagePath: string;
  originalFilename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  label: string | null;
  note: string | null;
}): Promise<PartnerUpload> {
  const [row] = await db
    .insert(schema.partnerUploads)
    .values(input)
    .returning();
  return row;
}

export async function markPartnerUploadDownloaded(opts: {
  workspaceId: string;
  uploadId: string;
}): Promise<void> {
  await db
    .update(schema.partnerUploads)
    .set({ downloadedAt: new Date() })
    .where(
      and(
        eq(schema.partnerUploads.id, opts.uploadId),
        eq(schema.partnerUploads.workspaceId, opts.workspaceId),
      ),
    );
}

export async function deletePartnerUpload(opts: {
  workspaceId: string;
  uploadId: string;
}): Promise<{ storagePath: string } | null> {
  const [row] = await db
    .delete(schema.partnerUploads)
    .where(
      and(
        eq(schema.partnerUploads.id, opts.uploadId),
        eq(schema.partnerUploads.workspaceId, opts.workspaceId),
      ),
    )
    .returning({ storagePath: schema.partnerUploads.storagePath });
  return row ?? null;
}
