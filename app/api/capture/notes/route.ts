import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCaptureIdentity, readJson } from "@/lib/capture/api";
import { createPost } from "@/db/queries/town-hall";
import {
  getLob,
  createProjectNote,
  type ProjectLinkCategory,
} from "@/db/queries/lines-of-business";
import { listPosts } from "@/db/queries/town-hall";
import { serializePost } from "@/lib/capture/serialize";

export const runtime = "nodejs";

const CATEGORIES = ["business", "marketing", "tech", "ops", "design", "finance", "other"] as const;

const Body = z.object({
  body: z.string().min(1).max(8000),
  /** When set, the note is attached to a line of business instead of posted. */
  lobId: z.string().uuid().nullish(),
  label: z.string().max(200).optional(),
  category: z.enum(CATEGORIES).optional(),
});

/**
 * POST /api/capture/notes — a quick note. With `lobId` it attaches to that
 * project (project_links kind='note', body in description). Without it, the
 * note is posted to the Town Hall feed as a kind='note' post.
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

  // Project-attached note.
  if (data.lobId) {
    const lob = await getLob({ id: data.lobId, workspaceId: auth.workspaceId }).catch(() => null);
    if (!lob) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const label = data.label ?? (data.body.split("\n")[0].slice(0, 120) || "Note");
    const row = await createProjectNote({
      workspaceId: auth.workspaceId,
      lobId: data.lobId,
      actorId: auth.userId,
      label,
      body: data.body,
      category: data.category as ProjectLinkCategory | undefined,
    });
    return NextResponse.json({ kind: "project-note", id: row.id, lobId: data.lobId }, { status: 201 });
  }

  // Town Hall note-post.
  const postId = await createPost({
    workspaceId: auth.workspaceId,
    authorId: auth.userId,
    body: data.body,
    kind: "note",
    mentionUserIds: [],
    refs: [],
  });
  const [created] = await listPosts({ workspaceId: auth.workspaceId, viewerId: auth.userId, limit: 1 });
  return NextResponse.json(
    { kind: "post", post: created?.id === postId ? serializePost(created) : { id: postId } },
    { status: 201 },
  );
}
