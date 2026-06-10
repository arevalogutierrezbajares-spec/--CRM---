import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/current-user";
import { getPartnerRoomBasic } from "@/db/queries/partner-access";
import { createRoomItem } from "@/db/queries/partner-repository";
import {
  createSignedUploadUrl,
  removeObjects,
  slugFilename,
  sniffHeadBytes,
} from "@/lib/project-files/storage";
import { isExecutableContent } from "@/lib/project-files/sniff";

type Params = Promise<{ roomId: string }>;

const MAX_BYTES = 50 * 1024 * 1024;

const SignBody = z.object({
  action: z.literal("sign"),
  filename: z.string().min(1).max(255),
  mimeType: z.string().max(160).optional(),
  sizeBytes: z.number().int().positive().max(MAX_BYTES),
});
const FinalizeBody = z.object({
  action: z.literal("finalize"),
  storagePath: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  originalFilename: z.string().min(1),
  mimeType: z.string().nullable().optional(),
  sizeBytes: z.number().nullable().optional(),
});

export async function POST(req: NextRequest, props: { params: Params }) {
  const user = await requireUser();
  const { roomId } = await props.params;

  const room = await getPartnerRoomBasic({ workspaceId: user.workspaceId, roomId });
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = (body as Record<string, unknown>)?.action;

  if (action === "sign") {
    const parsed = SignBody.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    const unique = crypto.randomUUID();
    const path = `${user.workspaceId}/room-items/${roomId}/${unique}-${slugFilename(parsed.data.filename)}`;
    const signed = await createSignedUploadUrl(path);
    if (!signed.ok) return NextResponse.json({ error: signed.error }, { status: 500 });
    return NextResponse.json({
      path: signed.data.path,
      token: signed.data.token,
      signedUrl: signed.data.signedUrl,
    });
  }

  if (action === "finalize") {
    const parsed = FinalizeBody.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    const requiredPrefix = `${user.workspaceId}/room-items/${roomId}/`;
    if (!parsed.data.storagePath.startsWith(requiredPrefix)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    // Admins may upload any media type, but never raw executables — these
    // items are offered to external partners for download.
    const head = await sniffHeadBytes(parsed.data.storagePath);
    if (head && isExecutableContent(head)) {
      await removeObjects([parsed.data.storagePath]).catch(() => ({ failed: [] }));
      return NextResponse.json({ error: "Executable content rejected" }, { status: 400 });
    }
    const item = await createRoomItem({
      workspaceId: user.workspaceId,
      roomId,
      kind: "file",
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      storagePath: parsed.data.storagePath,
      mimeType: parsed.data.mimeType ?? null,
      sizeBytes: parsed.data.sizeBytes ?? null,
      addedBy: user.id,
    });
    return NextResponse.json({ ok: true, id: item.id });
  }

  if (action === "abort") {
    const storagePath = (body as Record<string, unknown>)?.storagePath;
    const requiredPrefix = `${user.workspaceId}/room-items/${roomId}/`;
    if (typeof storagePath !== "string" || !storagePath.startsWith(requiredPrefix)) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    await removeObjects([storagePath]).catch(() => ({ failed: [] }));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
