import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { auditEmailEvent, upsertIncomingMessage } from "@/db/queries/email";
import { getEmailProvider } from "@/lib/email/provider";
import type { MailboxRecord } from "@/lib/email/types";

type MailboxRow = typeof schema.emailMailboxes.$inferSelect;

export function mailboxRowToRecord(row: MailboxRow): MailboxRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    address: row.address,
    displayName: row.displayName,
    type: row.type,
    status: row.status,
    ownerUserId: row.ownerUserId,
    syncEnabled: row.syncEnabled,
    sendEnabled: row.sendEnabled,
    aiEnabled: row.aiEnabled,
    providerMetadata: row.providerMetadata ?? {},
  };
}

export async function syncMailboxCache(args: {
  mailbox: MailboxRow;
  providerKind: "sandbox" | "microsoft_365" | "zoho_mail";
  actorId?: string | null;
  limit?: number;
}) {
  if (args.mailbox.status === "deactivated" || !args.mailbox.syncEnabled) {
    return { ok: false as const, error: "Sync is disabled for this mailbox." };
  }
  const provider = getEmailProvider(args.providerKind);
  const result = await provider.syncMailbox({
    mailbox: mailboxRowToRecord(args.mailbox),
    limit: args.limit ?? 25,
  });
  if (!result.ok) {
    await db
      .update(schema.emailMailboxes)
      .set({ lastSyncError: result.error, updatedAt: new Date() })
      .where(eq(schema.emailMailboxes.id, args.mailbox.id));
    await auditEmailEvent({
      workspaceId: args.mailbox.workspaceId,
      actorId: args.actorId ?? null,
      mailboxId: args.mailbox.id,
      action: "provider.sync.failed",
      metadata: { error: result.error, providerStatus: result.providerStatus },
    });
    return { ok: false as const, error: result.error };
  }

  for (const message of result.messages) {
    await upsertIncomingMessage({
      workspaceId: args.mailbox.workspaceId,
      mailboxId: args.mailbox.id,
      ...message,
    });
  }
  await db
    .update(schema.emailMailboxes)
    .set({
      providerMetadata: {
        ...(args.mailbox.providerMetadata ?? {}),
        ...(result.nextDeltaToken ? { lastDeltaToken: result.nextDeltaToken } : {}),
      },
      lastSyncedAt: new Date(),
      lastSyncError: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.emailMailboxes.id, args.mailbox.id));
  await auditEmailEvent({
    workspaceId: args.mailbox.workspaceId,
    actorId: args.actorId ?? null,
    mailboxId: args.mailbox.id,
    action: "provider.sync.completed",
    metadata: { provider: args.providerKind, messageCount: result.messages.length },
  });
  return { ok: true as const, messageCount: result.messages.length };
}
