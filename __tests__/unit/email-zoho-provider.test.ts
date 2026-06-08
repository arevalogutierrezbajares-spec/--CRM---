import { describe, expect, it, vi } from "vitest";
import {
  mapZohoAccountToMailbox,
  mapZohoMessageToInbound,
  zohoMailEmailProvider,
} from "@/lib/email/providers/zoho-mail";
import type { MailboxRecord } from "@/lib/email/types";

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
  providerMetadata: {
    zohoAccountId: "12345",
  },
};

describe("Zoho Mail email provider", () => {
  it("maps Zoho accounts into mailbox import records", () => {
    expect(
      mapZohoAccountToMailbox(
        {
          accountId: "12345",
          primaryEmailAddress: "Sales@CaneyCloud.com",
          displayName: "Sales",
        },
        "caneycloud.com",
      ),
    ).toMatchObject({
      providerMailboxId: "zoho:12345",
      address: "sales@caneycloud.com",
      displayName: "Sales",
      typeHint: "shared",
      metadata: {
        zohoAccountId: "12345",
      },
    });

    expect(
      mapZohoAccountToMailbox(
        {
          accountId: "external",
          primaryEmailAddress: "external@example.com",
          displayName: "External",
        },
        "caneycloud.com",
      ),
    ).toBeNull();
  });

  it("maps Zoho messages into inbound cache records", () => {
    expect(
      mapZohoMessageToInbound({
        messageId: "message-1",
        threadId: "thread-1",
        fromAddress: "Marta@Example.com",
        senderName: "Marta",
        toAddress: "sales@caneycloud.com",
        ccAddress: "tomas@caneycloud.com",
        subject: "Demo follow-up",
        htmlContent: "<p>Hello&nbsp;team &amp; thanks.</p>",
        receivedTime: "2026-06-07T12:00:00Z",
        hasAttachment: true,
      }),
    ).toMatchObject({
      providerThreadId: "thread-1",
      providerMessageId: "message-1",
      fromAddress: "marta@example.com",
      fromName: "Marta",
      toRecipients: ["sales@caneycloud.com"],
      ccRecipients: ["tomas@caneycloud.com"],
      subject: "Demo follow-up",
      bodyText: "Hello team & thanks.",
      hasAttachments: true,
    });
  });

  it("uses Zoho OAuth and Mail API for health, send, sync, and message mutations", async () => {
    const previousClientId = process.env.ZOHO_CLIENT_ID;
    const previousClientSecret = process.env.ZOHO_CLIENT_SECRET;
    const previousRefreshToken = process.env.ZOHO_REFRESH_TOKEN;
    const previousAccountsBase = process.env.ZOHO_ACCOUNTS_BASE_URL;
    const previousMailBase = process.env.ZOHO_MAIL_API_BASE_URL;
    const originalFetch = global.fetch;
    process.env.ZOHO_CLIENT_ID = "client-1";
    process.env.ZOHO_CLIENT_SECRET = "secret-1";
    process.env.ZOHO_REFRESH_TOKEN = "refresh-1";
    process.env.ZOHO_ACCOUNTS_BASE_URL = "https://accounts.zoho.test";
    process.env.ZOHO_MAIL_API_BASE_URL = "https://mail.zoho.test/api";

    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const value = String(url);
      if (value === "https://accounts.zoho.test/oauth/v2/token") {
        return new Response(JSON.stringify({ access_token: "access-1" }), { status: 200 });
      }
      if (value === "https://mail.zoho.test/api/accounts") {
        return new Response(
          JSON.stringify({
            data: [
              {
                accountId: "12345",
                primaryEmailAddress: "sales@caneycloud.com",
                displayName: "Sales",
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (value === "https://mail.zoho.test/api/accounts/12345/messages" && init?.method === "POST") {
        return new Response(JSON.stringify({ data: { messageId: "sent-1" } }), { status: 200 });
      }
      if (value === "https://mail.zoho.test/api/accounts/12345/folders") {
        return new Response(JSON.stringify({ data: [{ folderId: "inbox-1", folderName: "Inbox" }] }), { status: 200 });
      }
      if (value.startsWith("https://mail.zoho.test/api/accounts/12345/folders/inbox-1/messages/view")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                messageId: "message-1",
                fromAddress: "lead@example.com",
                toAddress: "sales@caneycloud.com",
                subject: "Zoho lead",
                summary: "Please follow up.",
                receivedTime: "2026-06-07T13:00:00Z",
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (value === "https://mail.zoho.test/api/accounts/12345/updatemessage" && init?.method === "PUT") {
        return new Response(JSON.stringify({ data: { ok: true } }), { status: 200 });
      }
      return new Response(`unexpected ${value}`, { status: 500 });
    });
    global.fetch = fetchMock as typeof fetch;

    try {
      await expect(zohoMailEmailProvider.health()).resolves.toMatchObject({
        ok: true,
        detail: expect.stringContaining("1 account"),
      });
      await expect(zohoMailEmailProvider.listMailboxes({ domain: "caneycloud.com" })).resolves.toMatchObject({
        ok: true,
        mailboxes: [expect.objectContaining({ address: "sales@caneycloud.com" })],
      });
      await expect(
        zohoMailEmailProvider.send({
          user: {
            id: "user-1",
            email: "owner@caneycloud.com",
            displayName: "Owner",
            workspaceId: "workspace-1",
            workspaceRole: "owner",
            whatsappPhone: null,
            timezone: "America/New_York",
          },
          mailbox,
          input: {
            mailboxId: mailbox.id,
            to: ["lead@example.com"],
            cc: [],
            bcc: [],
            subject: "Follow-up",
            bodyText: "Thanks.",
            idempotencyKey: "zoho-send-1",
          },
        }),
      ).resolves.toMatchObject({
        ok: true,
        providerMessageId: "sent-1",
      });
      await expect(zohoMailEmailProvider.syncMailbox({ mailbox, limit: 10 })).resolves.toMatchObject({
        ok: true,
        messages: [expect.objectContaining({ providerMessageId: "message-1" })],
      });
      await expect(
        zohoMailEmailProvider.markMessagesRead({
          mailbox,
          providerMessageIds: ["message-1"],
          isRead: true,
        }),
      ).resolves.toMatchObject({ ok: true, changed: 1 });
    } finally {
      global.fetch = originalFetch;
      if (previousClientId === undefined) delete process.env.ZOHO_CLIENT_ID;
      else process.env.ZOHO_CLIENT_ID = previousClientId;
      if (previousClientSecret === undefined) delete process.env.ZOHO_CLIENT_SECRET;
      else process.env.ZOHO_CLIENT_SECRET = previousClientSecret;
      if (previousRefreshToken === undefined) delete process.env.ZOHO_REFRESH_TOKEN;
      else process.env.ZOHO_REFRESH_TOKEN = previousRefreshToken;
      if (previousAccountsBase === undefined) delete process.env.ZOHO_ACCOUNTS_BASE_URL;
      else process.env.ZOHO_ACCOUNTS_BASE_URL = previousAccountsBase;
      if (previousMailBase === undefined) delete process.env.ZOHO_MAIL_API_BASE_URL;
      else process.env.ZOHO_MAIL_API_BASE_URL = previousMailBase;
    }
  });

  it("records provider-pending Zoho Free provisioning steps", async () => {
    await expect(
      zohoMailEmailProvider.provisionSharedMailbox?.({
        domain: "caneycloud.com",
        address: "admin@caneycloud.com",
        displayName: "Admin",
        requestedByEmail: "tomas@caneycloud.com",
      }),
    ).resolves.toMatchObject({
      ok: true,
      mode: "provider_pending",
      manualSteps: expect.arrayContaining([expect.stringContaining("Zoho Mail Admin Console")]),
    });

    await expect(
      zohoMailEmailProvider.provisionTeamMemberMailbox?.({
        domain: "caneycloud.com",
        email: "new@caneycloud.com",
        displayName: "New Member",
        requestedByEmail: "tomas@caneycloud.com",
      }),
    ).resolves.toMatchObject({
      ok: true,
      mode: "provider_pending",
      manualSteps: expect.arrayContaining([expect.stringContaining("Zoho Mail Admin Console")]),
    });
  });
});
