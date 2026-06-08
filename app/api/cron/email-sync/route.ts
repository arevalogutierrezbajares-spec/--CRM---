import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { captureWarn, withErrorCapture } from "@/lib/instrument";
import { syncMailboxCache } from "@/lib/email/sync";

export const GET = withErrorCapture("/api/cron/email-sync", async (req: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const rows = await db
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
        eq(schema.emailMailboxes.status, "active"),
        eq(schema.emailMailboxes.syncEnabled, true),
        eq(schema.emailProviderConnections.status, "connected"),
      ),
    )
    .limit(100);

  let synced = 0;
  let messages = 0;
  const failures: Array<{ mailboxId: string; address: string; error: string }> = [];

  for (const row of rows) {
    const result = await syncMailboxCache({
      mailbox: row.mailbox,
      providerKind: row.provider,
      actorId: null,
      limit: 25,
    });
    if (result.ok) {
      synced++;
      messages += result.messageCount;
    } else {
      failures.push({
        mailboxId: row.mailbox.id,
        address: row.mailbox.address,
        error: result.error,
      });
    }
  }

  if (failures.length > 0) {
    captureWarn("Email recovery sync completed with provider failures", {
      route: "/api/cron/email-sync",
      scanned: rows.length,
      synced,
      failureCount: failures.length,
      firstMailboxId: failures[0]?.mailboxId,
      firstError: failures[0]?.error,
    });
  }

  return NextResponse.json({
    ok: failures.length === 0,
    scanned: rows.length,
    synced,
    messages,
    failures,
  });
});
