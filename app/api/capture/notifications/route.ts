import { NextResponse, type NextRequest } from "next/server";
import { requireCaptureIdentity } from "@/lib/capture/api";
import { listNotifications, unreadCount } from "@/db/queries/town-hall";

export const runtime = "nodejs";

/**
 * GET /api/capture/notifications — the founder's inbox. `?all=1` returns the
 * full bell history; default is the active queue (unread + not snoozed). Always
 * includes the live unread count so the helper can badge without a second call.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCaptureIdentity(req);
  if (auth instanceof NextResponse) return auth;

  const all = req.nextUrl.searchParams.get("all") === "1";
  const [rows, unread] = await Promise.all([
    listNotifications({
      workspaceId: auth.workspaceId,
      userId: auth.userId,
      activeOnly: !all,
      limit: 100,
    }),
    unreadCount({ workspaceId: auth.workspaceId, userId: auth.userId }),
  ]);

  return NextResponse.json({
    unreadCount: unread,
    notifications: rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      authorName: n.authorName,
      entityType: n.entityType,
      entityId: n.entityId,
      href: n.href,
      read: n.readAt != null,
      snoozedUntil: n.snoozedUntil ? n.snoozedUntil.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    })),
  });
}
