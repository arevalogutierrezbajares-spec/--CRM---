import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashPartnerAccessToken } from "@/lib/partner-access-token.server";
import { createSignedUploadUrl, slugFilename } from "@/lib/project-files/storage";
import { PROJECT_FILES_BUCKET } from "@/lib/project-files/constants";
import { createPartnerUpload } from "@/db/queries/partner-uploads";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const SignBody = z.object({
  action: z.literal("sign"),
  filename: z.string().min(1).max(255),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().positive().max(25 * 1024 * 1024),
});

const FinalizeBody = z.object({
  action: z.literal("finalize"),
  storagePath: z.string().min(1),
  originalFilename: z.string().min(1),
  mimeType: z.string().nullable().optional(),
  sizeBytes: z.number().nullable().optional(),
  label: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

type Params = Promise<{ token: string }>;

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

export async function POST(req: NextRequest, props: { params: Params }) {
  const { token } = await props.params;
  const room = await resolveRoom(token);
  if (!room) {
    return NextResponse.json({ error: "Room not found or access expired" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const actionField = (body as Record<string, unknown>)?.action;

  if (actionField === "sign") {
    const parsed = SignBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { filename, sizeBytes } = parsed.data;
    const unique = crypto.randomUUID();
    const path = `${room.workspaceId}/partner-uploads/${room.id}/${unique}-${slugFilename(filename)}`;
    const signed = await createSignedUploadUrl(path);
    if (!signed.ok) {
      return NextResponse.json({ error: signed.error }, { status: 500 });
    }
    return NextResponse.json({ path: signed.data.path, token: signed.data.token, signedUrl: signed.data.signedUrl, bucket: PROJECT_FILES_BUCKET });
  }

  if (actionField === "finalize") {
    const parsed = FinalizeBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const upload = await createPartnerUpload({
      workspaceId: room.workspaceId,
      roomId: room.id,
      storagePath: parsed.data.storagePath,
      originalFilename: parsed.data.originalFilename,
      mimeType: parsed.data.mimeType ?? null,
      sizeBytes: parsed.data.sizeBytes ?? null,
      label: parsed.data.label ?? null,
      note: parsed.data.note ?? null,
    });
    return NextResponse.json({ id: upload.id });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
