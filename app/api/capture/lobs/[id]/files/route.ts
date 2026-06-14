import { NextResponse, type NextRequest } from "next/server";
import { requireCaptureIdentity } from "@/lib/capture/api";
import {
  listProjectLinks,
  getLob,
} from "@/db/queries/lines-of-business";
import { createSignedDownloadUrl } from "@/lib/project-files/storage";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

/**
 * GET /api/capture/lobs/{id}/files — the files (kind='file') attached to a
 * line of business. Each row carries a short-lived signed download URL so the
 * helper can open/download without a second round-trip. Notes/docs/links are
 * excluded — this is the helper's "project files" view.
 */
export async function GET(req: NextRequest, props: { params: Params }) {
  const auth = await requireCaptureIdentity(req);
  if (auth instanceof NextResponse) return auth;

  const { id: lobId } = await props.params;

  // Workspace-fence the lob before listing anything under it.
  const lob = await getLob({ id: lobId, workspaceId: auth.workspaceId }).catch(() => null);
  if (!lob) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const links = await listProjectLinks({ lobId, workspaceId: auth.workspaceId });
  const files = links.filter((l) => l.kind === "file" && l.storagePath);

  const out = await Promise.all(
    files.map(async (f) => {
      const signed = f.storagePath
        ? await createSignedDownloadUrl(f.storagePath)
        : { ok: false as const, error: "no path" };
      return {
        id: f.id,
        label: f.label,
        category: f.category,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        originalFilename: f.originalFilename,
        createdAt: f.createdAt,
        createdByName: f.createdByName,
        url: signed.ok ? signed.url : null,
      };
    }),
  );

  return NextResponse.json({ files: out });
}
