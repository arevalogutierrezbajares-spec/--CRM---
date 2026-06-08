import { describe, expect, it } from "vitest";
import { sandboxEmailProvider } from "@/lib/email/providers/sandbox";
import type { MailboxRecord, SendInput } from "@/lib/email/types";
import type { SessionUser } from "@/lib/current-user";

const user: SessionUser = {
  id: "user-1",
  email: "tomas@caneycloud.com",
  displayName: "Tomas",
  workspaceId: "workspace-1",
  workspaceRole: "owner",
  whatsappPhone: null,
  timezone: "America/New_York",
};

const mailbox: MailboxRecord = {
  id: "mailbox-1",
  workspaceId: "workspace-1",
  address: "sales@caneycloud.com",
  displayName: "Sales",
  type: "shared",
  status: "active",
  ownerUserId: null,
  syncEnabled: true,
  sendEnabled: true,
  aiEnabled: true,
  providerMetadata: {},
};

const input: SendInput = {
  mailboxId: mailbox.id,
  threadId: "thread-1",
  to: ["lead@example.com"],
  subject: "Proposal",
  bodyText: "Here is the proposal.",
  idempotencyKey: "idem-123456",
};

describe("sandbox email provider", () => {
  it("returns a deterministic sent provider message id", async () => {
    const result = await sandboxEmailProvider.send({ user, mailbox, input });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.providerMessageId).toBe("sandbox-sent-idem-123456");
  });

  it("blocks disabled mailboxes", async () => {
    const result = await sandboxEmailProvider.send({
      user,
      mailbox: { ...mailbox, sendEnabled: false },
      input,
    });
    expect(result.ok).toBe(false);
  });

  it("simulates provider Send As denial", async () => {
    const result = await sandboxEmailProvider.send({
      user,
      mailbox: { ...mailbox, providerMetadata: { sendAsDeniedUserIds: ["user-1"] } },
      input,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.providerStatus).toBe(403);
  });

  it("simulates provider read-state and archive mutations", async () => {
    await expect(
      sandboxEmailProvider.markMessagesRead({
        mailbox,
        providerMessageIds: ["message-1", "message-2"],
        isRead: true,
      }),
    ).resolves.toEqual({ ok: true, changed: 2 });
    await expect(
      sandboxEmailProvider.archiveMessages({
        mailbox,
        providerMessageIds: ["message-1"],
      }),
    ).resolves.toEqual({ ok: true, changed: 1 });
  });

  it("completes shared mailbox and team member provisioning deterministically", async () => {
    await expect(
      sandboxEmailProvider.provisionSharedMailbox?.({
        domain: "caneycloud.com",
        address: "admin@caneycloud.com",
        displayName: "Admin",
        requestedByEmail: "tomas@caneycloud.com",
      }),
    ).resolves.toMatchObject({
      ok: true,
      mode: "completed",
      mailbox: {
        providerMailboxId: "sandbox:admin@caneycloud.com",
        address: "admin@caneycloud.com",
        typeHint: "shared",
      },
    });

    await expect(
      sandboxEmailProvider.provisionTeamMemberMailbox?.({
        domain: "caneycloud.com",
        email: "new@caneycloud.com",
        displayName: "New Member",
        requestedByEmail: "tomas@caneycloud.com",
      }),
    ).resolves.toMatchObject({
      ok: true,
      mode: "completed",
      providerUserId: "sandbox-user:new@caneycloud.com",
      mailbox: {
        providerMailboxId: "sandbox:new@caneycloud.com",
        typeHint: "personal",
      },
    });
  });

  it("mirrors mailbox permissions in sandbox provisioning", async () => {
    await expect(
      sandboxEmailProvider.applyMailboxPermissions?.({
        mailboxAddress: "sales@caneycloud.com",
        requestedByEmail: "tomas@caneycloud.com",
        grants: [
          {
            userId: "user-1",
            userEmail: "tomas@caneycloud.com",
            fullAccess: true,
            sendAs: true,
          },
        ],
      }),
    ).resolves.toMatchObject({
      ok: true,
      mode: "completed",
      metadata: {
        grantCount: 1,
      },
    });
  });
});
