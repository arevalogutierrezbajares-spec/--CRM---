import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createSignedUploadUrl,
  removeObjects,
  slugFilename,
  sniffHeadBytes,
} from "@/lib/project-files/storage";
import { PROJECT_FILES_BUCKET } from "@/lib/project-files/constants";
import { isAllowedPartnerUpload, sniffPartnerUpload } from "@/lib/project-files/sniff";
import {
  countRecentPartnerUploads,
  createPartnerUpload,
} from "@/db/queries/partner-uploads";
import { resolvePartnerRoomByToken } from "@/db/queries/partner-access";
import { isPartnerRoomUnlocked } from "@/lib/partner-room-gate.server";

const MAX_BYTES = 25 * 1024 * 1024;

// Soft flood guard: a guest can't mint unlimited signed URLs / rows.
const RATE_WINDOW_SECONDS = 60;
const RATE_MAX_IN_WINDOW = 10;

const SignBody = z.object({
  action: z.literal("sign"),
  filename: z.string().min(1).max(255),
  mimeType: z.string().max(160).optional(),
  sizeBytes: z.number().int().positive().max(MAX_BYTES),
});

const FinalizeBody = z.object({
  action: z.literal("finalize"),
  storagePath: z.string().min(1),
  originalFilename: z.string().min(1).max(255),
  mimeType: z.string().max(160).nullable().optional(),
  sizeBytes: z.number().int().positive().max(MAX_BYTES).nullable().optional(),
  label: z.string().max(200).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

// Lets the client clean up an already-uploaded object when finalize fails,
// so half-finished uploads don't pile up as invisible orphans in storage.
const AbortBody = z.object({
  action: z.literal("abort"),
  storagePath: z.string().min(1),
});

type Params = Promise<{ token: string }>;

export async function POST(req: NextRequest, props: { params: Params }) {
  const { token } = await props.params;
  const room = await resolvePartnerRoomByToken(token).catch(() => null);
  if (!room) {
    return NextResponse.json({ error: "Room not found or access expired" }, { status: 404 });
  }
  if (!(await isPartnerRoomUnlocked(room))) {
    return NextResponse.json({ error: "Room is locked" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const actionField = (body as Record<string, unknown>)?.action;
  const requiredPrefix = `${room.workspaceId}/partner-uploads/${room.id}/`;

  if (actionField === "sign") {
    const parsed = SignBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { filename } = parsed.data;
    // Server-side allow-list — the client list is advisory only.
    if (!isAllowedPartnerUpload(filename)) {
      return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
    }
    const recent = await countRecentPartnerUploads({
      roomId: room.id,
      seconds: RATE_WINDOW_SECONDS,
    }).catch(() => 0);
    if (recent >= RATE_MAX_IN_WINDOW) {
      return NextResponse.json(
        { error: "Too many uploads at once. Wait a moment and try again." },
        { status: 429 },
      );
    }
    const unique = crypto.randomUUID();
    const path = `${requiredPrefix}${unique}-${slugFilename(filename)}`;
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
    // The storagePath is client-supplied; only accept one under this room's
    // own upload prefix so a visitor can't register a row pointing at another
    // workspace's private objects.
    if (!parsed.data.storagePath.startsWith(requiredPrefix)) {
      return NextResponse.json({ error: "Invalid upload path" }, { status: 400 });
    }
    if (!isAllowedPartnerUpload(parsed.data.originalFilename)) {
      await removeObjects([parsed.data.storagePath]).catch(() => ({ failed: [] }));
      return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
    }
    // Magic-byte check on the stored object — defeats renamed executables
    // uploaded by bypassing the client.
    const head = await sniffHeadBytes(parsed.data.storagePath);
    if (!head) {
      return NextResponse.json(
        { error: "Upload not found in storage — try again" },
        { status: 400 },
      );
    }
    const sniff = sniffPartnerUpload(parsed.data.originalFilename, head);
    if (!sniff.ok) {
      await removeObjects([parsed.data.storagePath]).catch(() => ({ failed: [] }));
      return NextResponse.json({ error: sniff.reason }, { status: 400 });
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

  if (actionField === "abort") {
    const parsed = AbortBody.safeParse(body);
    if (!parsed.success || !parsed.data.storagePath.startsWith(requiredPrefix)) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    await removeObjects([parsed.data.storagePath]).catch(() => ({ failed: [] }));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
