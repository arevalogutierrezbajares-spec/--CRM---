import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCaptureIdentity, readJson } from "@/lib/capture/api";
import {
  getLob,
  createProjectFile,
  type ProjectLinkCategory,
} from "@/db/queries/lines-of-business";
import { sniffHeadBytes, removeObjects } from "@/lib/project-files/storage";
import { isExecutableContent } from "@/lib/project-files/sniff";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;

const CATEGORIES = ["business", "marketing", "tech", "ops", "design", "finance", "other"] as const;

const Body = z.object({
  lobId: z.string().uuid(),
  storagePath: z.string().min(1),
  fileName: z.string().min(1).max(255),
  contentType: z.string().max(160).nullable().optional(),
  sizeBytes: z.number().int().positive().max(MAX_BYTES).nullable().optional(),
  label: z.string().max(200).nullable().optional(),
  category: z.enum(CATEGORIES).optional(),
});

/**
 * POST /api/capture/files/finalize — step 3 of the upload. Verifies the object
 * landed under this workspace+lob prefix, magic-byte-rejects executables, then
 * inserts the kind='file' row (createProjectFile, with its own audit). The
 * founder is trusted, so there is no extension allow-list — only the executable
 * floor that the partner path also enforces.
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
  const data = parsed.data;

  const lob = await getLob({ id: data.lobId, workspaceId: auth.workspaceId }).catch(() => null);
  if (!lob) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // The path is client-supplied; only accept one under this workspace+lob
  // prefix so a token can't register a row pointing at someone else's object.
  const requiredPrefix = `${auth.workspaceId}/${data.lobId}/`;
  if (!data.storagePath.startsWith(requiredPrefix)) {
    return NextResponse.json({ error: "Invalid upload path" }, { status: 400 });
  }

  // Magic-byte check on the stored object — defeats renamed executables.
  const head = await sniffHeadBytes(data.storagePath);
  if (!head) {
    return NextResponse.json(
      { error: "Upload not found in storage — try again" },
      { status: 400 },
    );
  }
  if (isExecutableContent(head)) {
    await removeObjects([data.storagePath]).catch(() => ({ failed: [] }));
    return NextResponse.json({ error: "Executable content rejected." }, { status: 400 });
  }

  const row = await createProjectFile({
    workspaceId: auth.workspaceId,
    lobId: data.lobId,
    actorId: auth.userId,
    label: data.label ?? data.fileName,
    category: (data.category ?? "other") as ProjectLinkCategory,
    storagePath: data.storagePath,
    mimeType: data.contentType ?? "application/octet-stream",
    sizeBytes: data.sizeBytes ?? 0,
    originalFilename: data.fileName,
  });

  return NextResponse.json({
    id: row.id,
    label: row.label,
    category: row.category,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    originalFilename: row.originalFilename,
  });
}
