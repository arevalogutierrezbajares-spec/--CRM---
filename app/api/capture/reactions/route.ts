import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCaptureIdentity, readJson } from "@/lib/capture/api";
import { toggleReaction } from "@/db/queries/town-hall";

export const runtime = "nodejs";

const Body = z.object({
  postId: z.string().uuid(),
  emoji: z.string().min(1).max(16),
});

/** POST /api/capture/reactions — toggle the founder's emoji reaction on a post. */
export async function POST(req: NextRequest) {
  const auth = await requireCaptureIdentity(req);
  if (auth instanceof NextResponse) return auth;

  const raw = await readJson(req);
  if (raw instanceof NextResponse) return raw;
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const res = await toggleReaction({
    postId: parsed.data.postId,
    userId: auth.userId,
    emoji: parsed.data.emoji,
    workspaceId: auth.workspaceId,
  });
  if (!res.ok) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  return NextResponse.json({ ok: true, on: res.on });
}
