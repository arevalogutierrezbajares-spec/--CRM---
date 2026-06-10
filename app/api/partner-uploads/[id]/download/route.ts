import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { createSignedDownloadUrl } from "@/lib/project-files/storage";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";

type Params = Promise<{ id: string }>;

export async function GET(_req: NextRequest, props: { params: Params }) {
  const user = await requireUser();
  const { id } = await props.params;

  const [upload] = await db
    .select()
    .from(schema.partnerUploads)
    .where(
      and(
        eq(schema.partnerUploads.id, id),
        eq(schema.partnerUploads.workspaceId, user.workspaceId),
      ),
    )
    .limit(1);

  if (!upload) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const signed = await createSignedDownloadUrl(upload.storagePath);
  if (!signed.ok) return NextResponse.json({ error: signed.error }, { status: 500 });

  // Mark as downloaded
  await db
    .update(schema.partnerUploads)
    .set({ downloadedAt: new Date() })
    .where(eq(schema.partnerUploads.id, id));

  return NextResponse.json({ url: signed.url });
}
