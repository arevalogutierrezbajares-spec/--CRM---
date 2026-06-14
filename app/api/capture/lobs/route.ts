import { NextResponse, type NextRequest } from "next/server";
import { requireCaptureIdentity } from "@/lib/capture/api";
import { listLines } from "@/db/queries/lines-of-business";

export const runtime = "nodejs";

/**
 * GET /api/capture/lobs — the file/note-owning portfolio units (lines of
 * business). The helper's Files + project-notes pickers use these (files
 * attach to `project_links.lob_id`). Returns `{ id, title }[]`, active first.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCaptureIdentity(req);
  if (auth instanceof NextResponse) return auth;

  const lobs = await listLines({ workspaceId: auth.workspaceId });
  return NextResponse.json({
    lobs: lobs.map((l) => ({ id: l.id, title: l.title })),
  });
}
