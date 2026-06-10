import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export type PartnerUpload = typeof schema.partnerUploads.$inferSelect;

/** Flood guard for the public upload route: uploads in this room recently. */
export async function countRecentPartnerUploads(input: {
  roomId: string;
  seconds: number;
}): Promise<number> {
  const since = new Date(Date.now() - input.seconds * 1000);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.partnerUploads)
    .where(
      and(
        eq(schema.partnerUploads.roomId, input.roomId),
        gt(schema.partnerUploads.createdAt, since),
      ),
    );
  return row?.count ?? 0;
}

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
