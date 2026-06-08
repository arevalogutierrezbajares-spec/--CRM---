import { describe, expect, it, vi } from "vitest";
import {
  buildGraphSendPayload,
  mapGraphMessageToInbound,
  mapGraphUserToMailbox,
  microsoftGraphEmailProvider,
} from "@/lib/email/providers/microsoft-graph";

describe("Microsoft Graph email provider mapping", () => {
  it("maps tenant users into mailbox import records", () => {
    expect(
      mapGraphUserToMailbox(
        {
          id: "graph-user-sales",
          displayName: "Sales",
          mail: "Sales@CaneyCloud.com",
          userPrincipalName: "sales@caneycloud.com",
        },
        "caneycloud.com",
      ),
    ).toMatchObject({
      providerMailboxId: "graph-user-sales",
      address: "sales@caneycloud.com",
      displayName: "Sales",
      typeHint: "shared",
    });

    expect(
      mapGraphUserToMailbox(
        {
          id: "graph-user-admin",
          displayName: "Admin",
          mail: "admin@caneycloud.com",
        },
        "caneycloud.com",
      ),
    ).toMatchObject({
      providerMailboxId: "graph-user-admin",
      address: "admin@caneycloud.com",
      typeHint: "shared",
    });

    expect(
      mapGraphUserToMailbox(
        {
          id: "external",
          displayName: "External",
          mail: "external@example.com",
        },
        "caneycloud.com",
      ),
    ).toBeNull();
  });

  it("maps Graph messages into inbound cache records", () => {
    const inbound = mapGraphMessageToInbound({
      id: "message-1",
      conversationId: "conversation-1",
      internetMessageId: "<message-1@example.com>",
      subject: "Demo follow-up",
      body: { contentType: "html", content: "<p>Hello&nbsp;team &amp; thanks.</p>" },
      from: { emailAddress: { address: "Marta@Example.com", name: "Marta" } },
      toRecipients: [{ emailAddress: { address: "sales@caneycloud.com" } }],
      ccRecipients: [{ emailAddress: { address: "tomas@caneycloud.com" } }],
      receivedDateTime: "2026-06-07T12:00:00Z",
      hasAttachments: true,
    });

    expect(inbound).toMatchObject({
      providerThreadId: "conversation-1",
      providerMessageId: "message-1",
      internetMessageId: "<message-1@example.com>",
      fromAddress: "marta@example.com",
      fromName: "Marta",
      toRecipients: ["sales@caneycloud.com"],
      ccRecipients: ["tomas@caneycloud.com"],
      subject: "Demo follow-up",
      bodyText: "Hello team & thanks.",
      hasAttachments: true,
    });
  });

  it("includes file attachments in Graph sendMail payloads", () => {
    expect(
      buildGraphSendPayload({
        mailboxId: "mailbox-1",
        threadId: "thread-1",
        to: ["marta@example.com"],
        cc: [],
        bcc: [],
        subject: "Proposal",
        bodyText: "Attached.",
        idempotencyKey: "send-key-1",
        attachments: [
          {
            filename: "proposal.txt",
            mimeType: "text/plain",
            sizeBytes: 12,
            contentBase64: "QXR0YWNoZWQu",
          },
        ],
      }),
    ).toMatchObject({
      message: {
        attachments: [
          {
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: "proposal.txt",
            contentType: "text/plain",
            contentBytes: "QXR0YWNoZWQu",
          },
        ],
      },
      saveToSentItems: true,
    });
  });

  it("returns provider-pending provisioning plans instead of fake Microsoft completion", async () => {
    const previous = process.env.MS_GRAPH_PROVISIONING_ENABLED;
    delete process.env.MS_GRAPH_PROVISIONING_ENABLED;
    try {
      await expect(
        microsoftGraphEmailProvider.provisionSharedMailbox?.({
          domain: "caneycloud.com",
          address: "sales-new@caneycloud.com",
          displayName: "Sales New",
          requestedByEmail: "tomas@caneycloud.com",
        }),
      ).resolves.toMatchObject({
        ok: true,
        mode: "provider_pending",
        manualSteps: expect.arrayContaining([
          expect.stringContaining("New-Mailbox -Shared"),
        ]),
      });

      await expect(
        microsoftGraphEmailProvider.provisionTeamMemberMailbox?.({
          domain: "caneycloud.com",
          email: "new@caneycloud.com",
          displayName: "New Member",
          requestedByEmail: "tomas@caneycloud.com",
        }),
      ).resolves.toMatchObject({
        ok: true,
        mode: "provider_pending",
        manualSteps: expect.arrayContaining([
          expect.stringContaining("Create or invite New Member"),
        ]),
      });
    } finally {
      if (previous === undefined) delete process.env.MS_GRAPH_PROVISIONING_ENABLED;
      else process.env.MS_GRAPH_PROVISIONING_ENABLED = previous;
    }
  });

  it("creates Microsoft users and assigns licenses when Graph provisioning is explicitly enabled", async () => {
    const previousEnabled = process.env.MS_GRAPH_PROVISIONING_ENABLED;
    const previousTenant = process.env.MS_GRAPH_TENANT_ID;
    const previousClient = process.env.MS_GRAPH_CLIENT_ID;
    const previousSecret = process.env.MS_GRAPH_CLIENT_SECRET;
    const previousSku = process.env.MS_GRAPH_LICENSE_SKU_ID;
    const previousUsage = process.env.MS_GRAPH_USAGE_LOCATION;
    const originalFetch = global.fetch;
    process.env.MS_GRAPH_PROVISIONING_ENABLED = "true";
    process.env.MS_GRAPH_TENANT_ID = "tenant-1";
    process.env.MS_GRAPH_CLIENT_ID = "client-1";
    process.env.MS_GRAPH_CLIENT_SECRET = "secret-1";
    process.env.MS_GRAPH_LICENSE_SKU_ID = "00000000-0000-0000-0000-000000000123";
    process.env.MS_GRAPH_USAGE_LOCATION = "US";
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const value = String(url);
      if (value.includes("login.microsoftonline.com")) {
        return new Response(JSON.stringify({ access_token: "token-1" }), { status: 200 });
      }
      if (value.endsWith("/users") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            id: "graph-user-new",
            displayName: "New Member",
            userPrincipalName: "new@caneycloud.com",
          }),
          { status: 201 },
        );
      }
      if (value.endsWith("/assignLicense") && init?.method === "POST") {
        return new Response(JSON.stringify({ id: "graph-user-new" }), { status: 200 });
      }
      return new Response("unexpected request", { status: 500 });
    });
    global.fetch = fetchMock as typeof fetch;
    try {
      await expect(
        microsoftGraphEmailProvider.provisionTeamMemberMailbox?.({
          domain: "caneycloud.com",
          email: "new@caneycloud.com",
          displayName: "New Member",
          requestedByEmail: "tomas@caneycloud.com",
          temporaryPassword: "TemporaryPass123!",
        }),
      ).resolves.toMatchObject({
        ok: true,
        mode: "provider_pending",
        providerUserId: "graph-user-new",
        metadata: {
          provisioningEnabled: true,
          userPrincipalName: "new@caneycloud.com",
        },
      });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/users/graph-user-new/assignLicense"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("00000000-0000-0000-0000-000000000123"),
        }),
      );
    } finally {
      global.fetch = originalFetch;
      if (previousEnabled === undefined) delete process.env.MS_GRAPH_PROVISIONING_ENABLED;
      else process.env.MS_GRAPH_PROVISIONING_ENABLED = previousEnabled;
      if (previousTenant === undefined) delete process.env.MS_GRAPH_TENANT_ID;
      else process.env.MS_GRAPH_TENANT_ID = previousTenant;
      if (previousClient === undefined) delete process.env.MS_GRAPH_CLIENT_ID;
      else process.env.MS_GRAPH_CLIENT_ID = previousClient;
      if (previousSecret === undefined) delete process.env.MS_GRAPH_CLIENT_SECRET;
      else process.env.MS_GRAPH_CLIENT_SECRET = previousSecret;
      if (previousSku === undefined) delete process.env.MS_GRAPH_LICENSE_SKU_ID;
      else process.env.MS_GRAPH_LICENSE_SKU_ID = previousSku;
      if (previousUsage === undefined) delete process.env.MS_GRAPH_USAGE_LOCATION;
      else process.env.MS_GRAPH_USAGE_LOCATION = previousUsage;
    }
  });
});
