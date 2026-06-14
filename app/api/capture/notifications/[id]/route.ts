import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCaptureIdentity, readJson } from "@/lib/capture/api";
import { markNotificationsRead, snoozeNotification } from "@/db/queries/town-hall";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

const Body = z.object({
  read: z.boolean().optional(),
  /** ISO timestamp to snooze until, or null to unsnooze. Omit to leave as-is. */
  snoozedUntil: z.string().datetime().nullable().optional(),
});

/**
 * PATCH /api/capture/notifications/{id} — mark read and/or snooze a single
 * notification. Both mutations are workspace+user fenced by their queries.
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

  if (parsed.data.read === true) {
    await markNotificationsRead({ workspaceId: auth.workspaceId, userId: auth.userId, ids: [id] });
  }
  if (parsed.data.snoozedUntil !== undefined) {
    const until = parsed.data.snoozedUntil ? new Date(parsed.data.snoozedUntil) : null;
    await snoozeNotification({ workspaceId: auth.workspaceId, userId: auth.userId, id, until });
  }

  return NextResponse.json({ ok: true });
}
