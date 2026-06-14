import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCaptureIdentity, readJson } from "@/lib/capture/api";
import { updateActionItem } from "@/db/queries/items";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

const PRIORITIES = ["now", "next", "later", "backlog"] as const;

const Body = z.object({
  done: z.boolean().optional(),
  title: z.string().min(1).max(500).optional(),
  dueDate: z.string().nullish(),
  priority: z.enum(PRIORITIES).nullish(),
  projectId: z.string().uuid().nullish(),
});

/**
 * PATCH /api/capture/action-items/{id} — toggle done (status open|done) and/or
 * edit fields. updateActionItem fences the row + any FKs to the workspace.
 */
export async function PATCH(req: NextRequest, props: { params: Params }) {
  const auth = await requireCaptureIdentity(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await props.params;
  const raw = await readJson(req);
  if (raw instanceof NextResponse) return raw;
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const res = await updateActionItem({
    workspaceId: auth.workspaceId,
    id,
    ...(parsed.data.done !== undefined ? { status: parsed.data.done ? "done" : "open" } : {}),
    ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    ...(parsed.data.dueDate !== undefined ? { dueDate: parsed.data.dueDate } : {}),
    ...(parsed.data.priority !== undefined ? { priority: parsed.data.priority } : {}),
    ...(parsed.data.projectId !== undefined ? { projectId: parsed.data.projectId } : {}),
  });
  if (!res) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, id: res.id, title: res.title });
}
