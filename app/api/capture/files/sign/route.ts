import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCaptureIdentity, readJson } from "@/lib/capture/api";
import { getLob } from "@/db/queries/lines-of-business";
import {
  buildStoragePath,
  createSignedUploadUrl,
  PROJECT_FILES_BUCKET,
} from "@/lib/project-files/storage";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;

const Body = z.object({
  lobId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  contentType: z.string().max(160).optional(),
  sizeBytes: z.number().int().positive().max(MAX_BYTES).optional(),
});

/**
 * POST /api/capture/files/sign — step 1 of the 3-step upload. Mints a Supabase
 * direct-upload URL under the lob's prefix. The helper then PUTs the bytes
 * straight to `signedUrl` (no auth header) and calls /files/finalize.
 */
export async function POST(req: NextRequest) {
  const auth = await requireCaptureIdentity(req);
  if (auth instanceof NextResponse) return auth;

  const raw = await readJson(req);
  if (raw instanceof NextResponse) return raw;
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Fence the lob to the founder's workspace before signing anything.
  const lob = await getLob({ id: parsed.data.lobId, workspaceId: auth.workspaceId }).catch(
    () => null,
  );
  if (!lob) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const path = buildStoragePath({
    workspaceId: auth.workspaceId,
    lobId: parsed.data.lobId,
    originalFilename: parsed.data.fileName,
  });
  const signed = await createSignedUploadUrl(path);
  if (!signed.ok) {
    return NextResponse.json({ error: signed.error }, { status: 500 });
  }
  return NextResponse.json({
    signedUrl: signed.data.signedUrl,
    storagePath: signed.data.path,
    token: signed.data.token,
    bucket: PROJECT_FILES_BUCKET,
  });
}
