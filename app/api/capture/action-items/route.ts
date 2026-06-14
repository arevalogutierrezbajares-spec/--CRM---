import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCaptureIdentity, readJson } from "@/lib/capture/api";
import { listOpenActionItems, createActionItem } from "@/db/queries/items";

export const runtime = "nodejs";

const PRIORITIES = ["now", "next", "later", "backlog"] as const;

/** GET /api/capture/action-items — open items, newest first. */
export async function GET(req: NextRequest) {
  const auth = await requireCaptureIdentity(req);
  if (auth instanceof NextResponse) return auth;

  const items = await listOpenActionItems({ workspaceId: auth.workspaceId, limit: 100 });
  return NextResponse.json({
    actionItems: items.map((i) => ({
      id: i.id,
      title: i.title,
      dueDate: i.dueDate,
      priority: i.priority,
      projectId: i.projectId,
      done: false,
    })),
  });
}

const Body = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(4000).nullish(),
  projectId: z.string().uuid().nullish(),
  dueDate: z.string().nullish(),
  priority: z.enum(PRIORITIES).nullish(),
});

/**
 * POST /api/capture/action-items — create one. `projectId` is workspace-fenced
 * inside createActionItem (projectOrNull), so an unknown id silently drops to
 * null rather than 400ing.
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

  const { id } = await createActionItem({
    workspaceId: auth.workspaceId,
    actorId: auth.userId,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    projectId: parsed.data.projectId ?? null,
    dueDate: parsed.data.dueDate ?? null,
    priority: parsed.data.priority ?? null,
  });

  return NextResponse.json(
    {
      id,
      title: parsed.data.title,
      dueDate: parsed.data.dueDate ?? null,
      priority: parsed.data.priority ?? null,
      projectId: parsed.data.projectId ?? null,
      done: false,
    },
    { status: 201 },
  );
}
