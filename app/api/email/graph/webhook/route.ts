import { NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { syncMailboxCache } from "@/lib/email/sync";
import { captureWarn, withErrorCapture } from "@/lib/instrument";

type GraphNotification = {
  subscriptionId?: string;
  clientState?: string;
  resource?: string;
  changeType?: string;
};

function mailboxKeyFromResource(resource?: string) {
  if (!resource) return null;
  const match = resource.match(/users\/([^/]+)/i);
  if (!match?.[1]) return null;
  return decodeURIComponent(match[1].replace(/^'|'$/g, ""));
}

async function graphWebhookGet(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("validationToken");
  if (token) return new Response(token, { status: 200, headers: { "Content-Type": "text/plain" } });
  return NextResponse.json({ ok: true, route: "email graph webhook" });
}

async function graphWebhookPost(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("validationToken");
  if (token) return new Response(token, { status: 200, headers: { "Content-Type": "text/plain" } });

  let body: { value?: GraphNotification[] };
  try {
    body = (await request.json()) as { value?: GraphNotification[] };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const expectedClientState = process.env.EMAIL_GRAPH_WEBHOOK_CLIENT_STATE;
  const notifications = body.value ?? [];
  if (expectedClientState) {
    const invalid = notifications.find((n) => n.clientState !== expectedClientState);
    if (invalid) {
      captureWarn("Rejected Microsoft Graph email webhook with invalid client state", {
        route: "/api/email/graph/webhook",
        notificationCount: notifications.length,
      });
      return NextResponse.json({ ok: false, error: "Invalid clientState" }, { status: 401 });
    }
  }

  const resources = notifications.map((n) => n.resource).filter(Boolean);
  const synced: string[] = [];
  const unmatched: string[] = [];
  const failures: Array<{ resource: string; error: string }> = [];

  for (const notification of notifications) {
    const key = mailboxKeyFromResource(notification.resource);
    if (!key || !notification.resource) continue;
    const [row] = await db
      .select({
        mailbox: schema.emailMailboxes,
        provider: schema.emailProviderConnections.provider,
      })
      .from(schema.emailMailboxes)
      .innerJoin(
        schema.emailProviderConnections,
        eq(schema.emailProviderConnections.id, schema.emailMailboxes.providerConnectionId),
      )
      .where(
        and(
          eq(schema.emailProviderConnections.provider, "microsoft_365"),
          eq(schema.emailProviderConnections.status, "connected"),
          eq(schema.emailMailboxes.status, "active"),
          eq(schema.emailMailboxes.syncEnabled, true),
          or(
            eq(schema.emailMailboxes.providerMailboxId, key),
            eq(schema.emailMailboxes.address, key.toLowerCase()),
          ),
        ),
      )
      .limit(1);
    if (!row) {
      unmatched.push(notification.resource);
      continue;
    }
    const result = await syncMailboxCache({
      mailbox: row.mailbox,
      providerKind: row.provider,
      actorId: null,
      limit: 10,
    });
    if (result.ok) {
      synced.push(row.mailbox.address);
    } else {
      failures.push({ resource: notification.resource, error: result.error });
    }
  }

  if (unmatched.length > 0 || failures.length > 0) {
    captureWarn("Microsoft Graph email webhook finished with unmatched or failed resources", {
      route: "/api/email/graph/webhook",
      received: notifications.length,
      unmatched: unmatched.length,
      failures: failures.length,
      firstUnmatched: unmatched[0],
      firstFailure: failures[0]?.error,
    });
  }

  const [workspace] = await db.select().from(schema.workspaces).limit(1);
  if (workspace && notifications.length > 0) {
    await db.insert(schema.emailAuditEvents).values({
      workspaceId: workspace.id,
      action: "provider.graph.notification",
      metadata: {
        count: notifications.length,
        resources,
        changeTypes: notifications.map((n) => n.changeType).filter(Boolean),
        synced,
        unmatched,
        failures,
      },
    });
  }

  return NextResponse.json({
    ok: failures.length === 0,
    received: notifications.length,
    synced: synced.length,
    unmatched: unmatched.length,
    failures,
  });
}

export const GET = withErrorCapture("/api/email/graph/webhook", graphWebhookGet);
export const POST = withErrorCapture("/api/email/graph/webhook", graphWebhookPost);
