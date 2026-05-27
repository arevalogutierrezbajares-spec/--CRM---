import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/current-user";
import { revalidatePath } from "next/cache";

const { meetings } = schema;

const patchSchema = z.object({
  action: z.enum(["start", "end"]),
});

type Params = Promise<{ id: string }>;

export async function PATCH(req: NextRequest, props: { params: Params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await props.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const now = new Date();
  const update =
    parsed.data.action === "start"
      ? { startedAt: now }
      : { endedAt: now };

  const [row] = await db
    .update(meetings)
    .set(update)
    .where(and(eq(meetings.id, id), eq(meetings.workspaceId, user.workspaceId)))
    .returning({ id: meetings.id });

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  revalidatePath(`/meetings/${id}`);
  return NextResponse.json({ ok: true, ts: now.toISOString() });
}
