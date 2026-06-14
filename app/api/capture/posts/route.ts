import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCaptureIdentity, readJson } from "@/lib/capture/api";
import { listPosts, createPost, type PostView } from "@/db/queries/town-hall";
import { listProjectsForPicker } from "@/db/queries/items";
import { listWorkspaceMembers } from "@/db/queries/team";
import { serializePost } from "@/lib/capture/serialize";

export const runtime = "nodejs";

/** GET /api/capture/posts — newest-first Town Hall feed. */
export async function GET(req: NextRequest) {
  const auth = await requireCaptureIdentity(req);
  if (auth instanceof NextResponse) return auth;

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 100);
  const posts = await listPosts({ workspaceId: auth.workspaceId, viewerId: auth.userId, limit });
  return NextResponse.json({ posts: posts.map(serializePost) });
}

const PostBody = z.object({
  body: z.string().min(1).max(8000),
  projectId: z.string().uuid().nullish(),
  mentionUserIds: z.array(z.string().uuid()).max(50).optional(),
});

/**
 * POST /api/capture/posts — create a message post. Optional `projectId` becomes
 * a #project reference (validated + labelled from the picker); `mentionUserIds`
 * are fenced to the workspace roster (createPost notifies each of them).
 */
export async function POST(req: NextRequest) {
  const auth = await requireCaptureIdentity(req);
  if (auth instanceof NextResponse) return auth;

  const raw = await readJson(req);
  if (raw instanceof NextResponse) return raw;
  const parsed = PostBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const refs: PostView["refs"] = [];
  if (parsed.data.projectId) {
    const project = (await listProjectsForPicker(auth.workspaceId)).find(
      (p) => p.id === parsed.data.projectId,
    );
    if (!project) return NextResponse.json({ error: "Unknown project" }, { status: 400 });
    refs.push({ id: "", refType: "project", refId: project.id, label: project.title });
  }

  let mentionUserIds: string[] = [];
  if (parsed.data.mentionUserIds?.length) {
    const memberIds = new Set((await listWorkspaceMembers(auth.workspaceId)).map((m) => m.userId));
    mentionUserIds = parsed.data.mentionUserIds.filter((id) => memberIds.has(id));
  }

  const postId = await createPost({
    workspaceId: auth.workspaceId,
    authorId: auth.userId,
    body: parsed.data.body,
    kind: "message",
    mentionUserIds,
    refs: refs.map((r) => ({ refType: r.refType, refId: r.refId, label: r.label })),
  });

  const [created] = await listPosts({ workspaceId: auth.workspaceId, viewerId: auth.userId, limit: 1 });
  return NextResponse.json(
    { post: created?.id === postId ? serializePost(created) : { id: postId } },
    { status: 201 },
  );
}
