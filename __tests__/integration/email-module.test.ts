import { describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  archiveEmailThreadAction,
  bulkUpdateEmailThreadsAction,
  checkProvisioningRequestAction,
  classifyMailboxAction,
  generateEmailActiveBrainAction,
  getEmailWorkloadBriefingAction,
  importMicrosoftMailboxesAction,
  importZohoMailboxesAction,
  linkEmailThreadToInitiativeAction,
  linkEmailThreadToMilestoneAction,
  provisionSharedInboxAction,
  provisionTeamMemberMailboxAction,
  saveEmailDraftAction,
  sendEmailAction,
  setEmailThreadReadStateAction,
  syncSandboxMailboxAction,
  updateEmailThreadStatusAction,
  updateMailboxSignatureAction,
} from "@/app/(app)/email/actions";
import { POST as graphWebhookPost } from "@/app/api/email/graph/webhook/route";
import {
  getEmailModuleData,
  getMailboxForAction,
  listAccessibleMailboxes,
  upsertIncomingMessage,
} from "@/db/queries/email";
import { seedSandboxEmailModule } from "@/db/queries/email-sandbox";
import { syncMailboxCache } from "@/lib/email/sync";
import { microsoftGraphEmailProvider } from "@/lib/email/providers/microsoft-graph";
import { zohoMailEmailProvider } from "@/lib/email/providers/zoho-mail";
import type { SessionUser } from "@/lib/current-user";
import { FAKE_USER_ID, FAKE_WORKSPACE_ID } from "./setup";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const DIEGO_ID = "10000000-0000-4000-8000-000000000002";
const ANA_ID = "10000000-0000-4000-8000-000000000001";

function sessionUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: FAKE_USER_ID,
    email: "test@local",
    displayName: "Test Founder",
    workspaceId: FAKE_WORKSPACE_ID,
    workspaceRole: "owner",
    whatsappPhone: null,
    timezone: "America/New_York",
    ...overrides,
  };
}

describe("email module integration", () => {
  it("seeds sandbox mailboxes, access grants, CRM links, attachments, and audit", async () => {
    const owner = sessionUser();
    await seedSandboxEmailModule(owner);

    const data = await getEmailModuleData(owner);
    expect(data.setupComplete).toBe(true);
    expect(data.provider?.provider).toBe("sandbox");
    expect(data.mailboxes.map((m) => m.address)).toEqual(
      expect.arrayContaining([
        "tomas@caneycloud.com",
        "sales@caneycloud.com",
        "support@caneycloud.com",
        "ana@caneycloud.com",
        "finance@caneycloud.com",
      ]),
    );
    expect(data.mailboxes.some((m) => m.type === "personal")).toBe(true);
    expect(data.mailboxes.some((m) => m.type === "shared")).toBe(true);
    expect(data.accessGrants.some((grant) => grant.userEmail === "diego@caneycloud.com")).toBe(true);
    expect(data.threads.some((thread) => thread.hasAttachments)).toBe(true);
    expect(data.threads.some((thread) => thread.links.length > 0)).toBe(true);
    const victorThread = data.threads.find((thread) => thread.subject.includes("Partnership intro"));
    expect(victorThread).toMatchObject({
      lastSenderName: "Victor Andrade",
      lastSenderAddress: "victor@example.com",
      lastRecipientSummary: "sales@caneycloud.com",
    });
    expect(victorThread?.searchText.toLowerCase()).toContain("operating model");
    expect(victorThread?.searchText.toLowerCase()).toContain("victor@example.com");
    expect(data.audit.some((event) => event.action === "sandbox.seeded")).toBe(true);
  });

  it("scopes member mailboxes while owner can explicitly view personal mailboxes", async () => {
    const owner = sessionUser();
    await seedSandboxEmailModule(owner);

    const diego = sessionUser({
      id: DIEGO_ID,
      email: "diego@caneycloud.com",
      displayName: "Diego Sales",
      workspaceRole: "member",
    });
    const diegoMailboxes = await listAccessibleMailboxes(diego);
    expect(diegoMailboxes.map((mailbox) => mailbox.address)).toContain("sales@caneycloud.com");
    expect(diegoMailboxes.map((mailbox) => mailbox.address)).not.toContain("finance@caneycloud.com");
    expect(diegoMailboxes.map((mailbox) => mailbox.address)).not.toContain("ana@caneycloud.com");

    const ownerData = await getEmailModuleData(owner);
    const anaMailbox = ownerData.mailboxes.find((mailbox) => mailbox.ownerUserId === ANA_ID);
    expect(anaMailbox?.address).toBe("ana@caneycloud.com");
    const ownerAnaAccess = await getMailboxForAction(owner, anaMailbox!.id);
    expect(ownerAnaAccess?.rights.canView).toBe(true);
  });

  it("provisions a shared inbox, mirrors access, records the request ledger, and supports classification", async () => {
    const owner = sessionUser();
    await seedSandboxEmailModule(owner);

    await expect(
      provisionSharedInboxAction({
        address: "admin@caneycloud.com",
        displayName: "Admin",
        userIds: [DIEGO_ID],
      }),
    ).resolves.toMatchObject({ ok: true });

    const data = await getEmailModuleData(owner);
    const adminMailbox = data.mailboxes.find((mailbox) => mailbox.address === "admin@caneycloud.com");
    expect(adminMailbox).toMatchObject({
      type: "shared",
      aiEnabled: true,
    });
    expect(data.accessGrants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mailboxId: adminMailbox!.id,
          userEmail: "diego@caneycloud.com",
          canReply: true,
          canSendAs: true,
          canAssign: true,
        }),
      ]),
    );
    expect(data.provisioningRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "shared_mailbox",
          status: "completed",
          targetEmail: "admin@caneycloud.com",
          targetMailboxId: adminMailbox!.id,
        }),
      ]),
    );
    expect(data.audit.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "mailbox.provision.shared.requested",
        "mailbox.provision.shared.crm_access_mirrored",
        "mailbox.provision.shared.completed",
      ]),
    );

    await expect(
      classifyMailboxAction({
        mailboxId: adminMailbox!.id,
        type: "system",
        ownerUserId: null,
      }),
    ).resolves.toMatchObject({ ok: true });
    const classified = await getEmailModuleData(owner);
    expect(classified.mailboxes.find((mailbox) => mailbox.id === adminMailbox!.id)).toMatchObject({
      type: "system",
      ownerUserId: null,
    });
    expect(classified.audit.map((event) => event.action)).toContain("mailbox.classified");
  });

  it("provisions a team member mailbox end to end in the sandbox provider", async () => {
    const owner = sessionUser();
    await seedSandboxEmailModule(owner);

    await expect(
      provisionTeamMemberMailboxAction({
        displayName: "Provisioned Member",
        email: "provisioned@caneycloud.com",
        temporaryPassword: "TemporaryPass123!",
        usageLocation: "US",
      }),
    ).resolves.toMatchObject({ ok: true });

    const data = await getEmailModuleData(owner);
    const member = data.members.find((item) => item.email === "provisioned@caneycloud.com");
    expect(member).toMatchObject({
      displayName: "Provisioned Member",
      role: "member",
    });
    const mailbox = data.mailboxes.find((item) => item.address === "provisioned@caneycloud.com");
    expect(mailbox).toMatchObject({
      type: "personal",
      ownerUserId: member!.userId,
      aiEnabled: false,
    });
    expect(data.accessGrants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mailboxId: mailbox!.id,
          userId: member!.userId,
          canView: true,
          canReply: true,
          canSendAs: true,
          canManageSettings: true,
        }),
      ]),
    );
    expect(data.provisioningRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "team_member",
          status: "completed",
          targetEmail: "provisioned@caneycloud.com",
          targetUserId: member!.userId,
          targetMailboxId: mailbox!.id,
        }),
      ]),
    );
    expect(data.audit.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "mailbox.provision.team_member.requested",
        "mailbox.provision.team_member.crm_access_mirrored",
        "mailbox.provision.team_member.completed",
      ]),
    );
  });

  it("imports existing Microsoft mailboxes, classifies type hints, mirrors owner access, and records import requests", async () => {
    const owner = sessionUser();
    await db
      .insert(schema.users)
      .values({ id: ANA_ID, email: "ana@caneycloud.com", displayName: "Ana Ops" })
      .onConflictDoNothing();
    await db
      .insert(schema.workspaceMembers)
      .values({ workspaceId: owner.workspaceId, userId: ANA_ID, role: "member" })
      .onConflictDoNothing();
    await db.insert(schema.emailProviderConnections).values({
      workspaceId: owner.workspaceId,
      provider: "microsoft_365",
      domain: "caneycloud.com",
      status: "connected",
      healthStatus: "healthy",
      connectedBy: owner.id,
      connectedAt: new Date(),
    });
    const listSpy = vi.spyOn(microsoftGraphEmailProvider, "listMailboxes").mockResolvedValue({
      ok: true,
      mailboxes: [
        {
          providerMailboxId: "graph-user-ana",
          address: "ana@caneycloud.com",
          displayName: "Ana Ops",
          typeHint: "personal",
        },
        {
          providerMailboxId: "graph-shared-admin",
          address: "admin@caneycloud.com",
          displayName: "Admin",
          typeHint: "shared",
        },
      ],
    });
    try {
      await expect(importMicrosoftMailboxesAction()).resolves.toMatchObject({ ok: true });
    } finally {
      listSpy.mockRestore();
    }

    const data = await getEmailModuleData(owner);
    expect(data.mailboxes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ address: "ana@caneycloud.com", type: "personal", ownerUserId: ANA_ID }),
        expect.objectContaining({ address: "admin@caneycloud.com", type: "shared", ownerUserId: null }),
      ]),
    );
    const personal = data.mailboxes.find((mailbox) => mailbox.address === "ana@caneycloud.com");
    expect(data.accessGrants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mailboxId: personal!.id,
          userId: ANA_ID,
          canManageSettings: true,
        }),
      ]),
    );
    expect(data.provisioningRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "import_existing", status: "completed", targetEmail: "ana@caneycloud.com" }),
        expect.objectContaining({ kind: "import_existing", status: "completed", targetEmail: "admin@caneycloud.com" }),
      ]),
    );
  });

  it("imports existing Zoho mailboxes, preserves account metadata, and mirrors owner access", async () => {
    const owner = sessionUser();
    await db
      .insert(schema.users)
      .values({ id: ANA_ID, email: "ana@caneycloud.com", displayName: "Ana Ops" })
      .onConflictDoNothing();
    await db
      .insert(schema.workspaceMembers)
      .values({ workspaceId: owner.workspaceId, userId: ANA_ID, role: "member" })
      .onConflictDoNothing();
    await db.insert(schema.emailProviderConnections).values({
      workspaceId: owner.workspaceId,
      provider: "zoho_mail",
      domain: "caneycloud.com",
      status: "connected",
      healthStatus: "healthy",
      connectedBy: owner.id,
      connectedAt: new Date(),
    });
    const listSpy = vi.spyOn(zohoMailEmailProvider, "listMailboxes").mockResolvedValue({
      ok: true,
      mailboxes: [
        {
          providerMailboxId: "zoho:ana-account",
          address: "ana@caneycloud.com",
          displayName: "Ana Ops",
          typeHint: "personal",
          metadata: { zohoAccountId: "ana-account", folders: ["zoho-account:ana-account"] },
        },
        {
          providerMailboxId: "zoho:admin-account",
          address: "admin@caneycloud.com",
          displayName: "Admin",
          typeHint: "shared",
          metadata: { zohoAccountId: "admin-account", folders: ["zoho-account:admin-account"] },
        },
      ],
    });
    try {
      await expect(importZohoMailboxesAction()).resolves.toMatchObject({ ok: true });
    } finally {
      listSpy.mockRestore();
    }

    const data = await getEmailModuleData(owner);
    const personal = data.mailboxes.find((mailbox) => mailbox.address === "ana@caneycloud.com");
    const shared = data.mailboxes.find((mailbox) => mailbox.address === "admin@caneycloud.com");
    expect(personal).toMatchObject({
      type: "personal",
      ownerUserId: ANA_ID,
      providerMailboxId: "zoho:ana-account",
      providerMetadata: { zohoAccountId: "ana-account" },
    });
    expect(shared).toMatchObject({
      type: "shared",
      ownerUserId: null,
      providerMailboxId: "zoho:admin-account",
      providerMetadata: { zohoAccountId: "admin-account" },
    });
    expect(data.accessGrants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mailboxId: personal!.id,
          userId: ANA_ID,
          canManageSettings: true,
        }),
      ]),
    );
    expect(data.provisioningRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "import_existing", status: "completed", targetEmail: "ana@caneycloud.com" }),
        expect.objectContaining({ kind: "import_existing", status: "completed", targetEmail: "admin@caneycloud.com" }),
      ]),
    );
    expect(data.audit.map((event) => event.action)).toContain("mailbox.imported");
  });

  it("keeps Zoho Free shared provisioning pending until import proves the mailbox exists", async () => {
    const owner = sessionUser();
    await db
      .insert(schema.users)
      .values({ id: DIEGO_ID, email: "diego@caneycloud.com", displayName: "Diego Sales" })
      .onConflictDoNothing();
    await db
      .insert(schema.workspaceMembers)
      .values({ workspaceId: owner.workspaceId, userId: DIEGO_ID, role: "member" })
      .onConflictDoNothing();
    await db.insert(schema.emailProviderConnections).values({
      workspaceId: owner.workspaceId,
      provider: "zoho_mail",
      domain: "caneycloud.com",
      status: "connected",
      healthStatus: "healthy",
      connectedBy: owner.id,
      connectedAt: new Date(),
    });

    await expect(
      provisionSharedInboxAction({
        address: "zoho-sales@caneycloud.com",
        displayName: "Zoho Sales",
        userIds: [DIEGO_ID],
      }),
    ).resolves.toMatchObject({ ok: true });

    let data = await getEmailModuleData(owner);
    expect(data.mailboxes.find((mailbox) => mailbox.address === "zoho-sales@caneycloud.com")).toBeUndefined();
    const request = data.provisioningRequests.find((item) => item.targetEmail === "zoho-sales@caneycloud.com");
    expect(request).toMatchObject({
      kind: "shared_mailbox",
      status: "provider_pending",
      providerPlan: {
        provider: "zoho_mail",
      },
    });
    expect(request?.providerPlan.manualSteps).toEqual(
      expect.arrayContaining([expect.stringContaining("Zoho Mail Admin Console")]),
    );

    const listSpy = vi.spyOn(zohoMailEmailProvider, "listMailboxes").mockResolvedValue({
      ok: true,
      mailboxes: [
        {
          providerMailboxId: "zoho:zoho-sales-account",
          address: "zoho-sales@caneycloud.com",
          displayName: "Zoho Sales",
          typeHint: "shared",
          metadata: { zohoAccountId: "zoho-sales-account" },
        },
      ],
    });
    try {
      await expect(checkProvisioningRequestAction(request!.id)).resolves.toMatchObject({ ok: true });
    } finally {
      listSpy.mockRestore();
    }

    data = await getEmailModuleData(owner);
    const mailbox = data.mailboxes.find((item) => item.address === "zoho-sales@caneycloud.com");
    expect(mailbox).toMatchObject({
      type: "shared",
      providerMailboxId: "zoho:zoho-sales-account",
      providerMetadata: { zohoAccountId: "zoho-sales-account" },
    });
    expect(data.provisioningRequests.find((item) => item.id === request!.id)).toMatchObject({
      status: "completed",
      targetMailboxId: mailbox!.id,
    });
    expect(data.accessGrants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mailboxId: mailbox!.id, userId: owner.id, canSendAs: true }),
        expect.objectContaining({ mailboxId: mailbox!.id, userId: DIEGO_ID, canReply: true }),
      ]),
    );
  });

  it("keeps Zoho Free team-member provisioning pending until the personal mailbox imports", async () => {
    const owner = sessionUser();
    await db.insert(schema.emailProviderConnections).values({
      workspaceId: owner.workspaceId,
      provider: "zoho_mail",
      domain: "caneycloud.com",
      status: "connected",
      healthStatus: "healthy",
      connectedBy: owner.id,
      connectedAt: new Date(),
    });

    await expect(
      provisionTeamMemberMailboxAction({
        displayName: "Zoho Member",
        email: "zoho-member@caneycloud.com",
        temporaryPassword: "",
        usageLocation: "",
      }),
    ).resolves.toMatchObject({ ok: true });

    let data = await getEmailModuleData(owner);
    const member = data.members.find((item) => item.email === "zoho-member@caneycloud.com");
    expect(member).toMatchObject({ displayName: "Zoho Member", role: "member" });
    expect(data.mailboxes.find((mailbox) => mailbox.address === "zoho-member@caneycloud.com")).toBeUndefined();
    const request = data.provisioningRequests.find((item) => item.targetEmail === "zoho-member@caneycloud.com");
    expect(request).toMatchObject({
      kind: "team_member",
      status: "provider_pending",
      targetUserId: member!.userId,
      providerPlan: {
        provider: "zoho_mail",
      },
    });

    const listSpy = vi.spyOn(zohoMailEmailProvider, "listMailboxes").mockResolvedValue({
      ok: true,
      mailboxes: [
        {
          providerMailboxId: "zoho:member-account",
          address: "zoho-member@caneycloud.com",
          displayName: "Zoho Member",
          typeHint: "personal",
          metadata: { zohoAccountId: "member-account" },
        },
      ],
    });
    try {
      await expect(checkProvisioningRequestAction(request!.id)).resolves.toMatchObject({ ok: true });
    } finally {
      listSpy.mockRestore();
    }

    data = await getEmailModuleData(owner);
    const mailbox = data.mailboxes.find((item) => item.address === "zoho-member@caneycloud.com");
    expect(mailbox).toMatchObject({
      type: "personal",
      ownerUserId: member!.userId,
      providerMailboxId: "zoho:member-account",
      providerMetadata: { zohoAccountId: "member-account" },
    });
    expect(data.accessGrants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mailboxId: mailbox!.id,
          userId: member!.userId,
          canSendAs: true,
          canManageSettings: true,
        }),
      ]),
    );
    expect(data.provisioningRequests.find((item) => item.id === request!.id)).toMatchObject({
      status: "completed",
      targetMailboxId: mailbox!.id,
    });
  });

  it("checks a pending Microsoft provisioning request and imports the mailbox when provider-ready", async () => {
    const owner = sessionUser();
    const [provider] = await db
      .insert(schema.emailProviderConnections)
      .values({
        workspaceId: owner.workspaceId,
        provider: "microsoft_365",
        domain: "caneycloud.com",
        status: "connected",
        healthStatus: "healthy",
        connectedBy: owner.id,
        connectedAt: new Date(),
      })
      .returning();
    const [request] = await db
      .insert(schema.emailProvisioningRequests)
      .values({
        workspaceId: owner.workspaceId,
        providerConnectionId: provider.id,
        kind: "shared_mailbox",
        status: "provider_pending",
        targetEmail: "ready@caneycloud.com",
        displayName: "Ready",
        requestedBy: owner.id,
        desiredAccess: [
          {
            userId: owner.id,
            userEmail: owner.email,
            fullAccess: true,
            sendAs: true,
            rights: {
              canView: true,
              canReply: true,
              canSendAs: true,
              canAssign: true,
              canManageAccess: true,
              canManageSettings: true,
            },
          },
        ],
      })
      .returning();
    const listSpy = vi.spyOn(microsoftGraphEmailProvider, "listMailboxes").mockResolvedValue({
      ok: true,
      mailboxes: [
        {
          providerMailboxId: "graph-ready-shared",
          address: "ready@caneycloud.com",
          displayName: "Ready",
          typeHint: "shared",
        },
      ],
    });
    try {
      await expect(checkProvisioningRequestAction(request.id)).resolves.toMatchObject({ ok: true });
    } finally {
      listSpy.mockRestore();
    }

    const data = await getEmailModuleData(owner);
    const mailbox = data.mailboxes.find((item) => item.address === "ready@caneycloud.com");
    expect(mailbox).toMatchObject({ type: "shared", providerMailboxId: "graph-ready-shared" });
    expect(data.provisioningRequests.find((item) => item.id === request.id)).toMatchObject({
      status: "completed",
      targetMailboxId: mailbox!.id,
    });
    expect(data.accessGrants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mailboxId: mailbox!.id, userId: owner.id, canSendAs: true }),
      ]),
    );
    expect(data.audit.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "mailbox.provision.check.crm_access_mirrored",
        "mailbox.provision.completed_after_check",
      ]),
    );
  });

  it("checks a pending team-member request and imports a personal mailbox for the target user", async () => {
    const owner = sessionUser();
    await db
      .insert(schema.users)
      .values({ id: ANA_ID, email: "ana@caneycloud.com", displayName: "Ana Ops" })
      .onConflictDoNothing();
    await db
      .insert(schema.workspaceMembers)
      .values({ workspaceId: owner.workspaceId, userId: ANA_ID, role: "member" })
      .onConflictDoNothing();
    const [provider] = await db
      .insert(schema.emailProviderConnections)
      .values({
        workspaceId: owner.workspaceId,
        provider: "microsoft_365",
        domain: "caneycloud.com",
        status: "connected",
        healthStatus: "healthy",
        connectedBy: owner.id,
        connectedAt: new Date(),
      })
      .returning();
    const [request] = await db
      .insert(schema.emailProvisioningRequests)
      .values({
        workspaceId: owner.workspaceId,
        providerConnectionId: provider.id,
        kind: "team_member",
        status: "provider_pending",
        targetEmail: "ana@caneycloud.com",
        displayName: "Ana Ops",
        targetUserId: ANA_ID,
        requestedBy: owner.id,
        desiredAccess: [
          {
            userId: ANA_ID,
            userEmail: "ana@caneycloud.com",
            fullAccess: true,
            sendAs: true,
            rights: {
              canView: true,
              canReply: true,
              canSendAs: true,
              canAssign: true,
              canManageAccess: true,
              canManageSettings: true,
            },
          },
        ],
      })
      .returning();
    const listSpy = vi.spyOn(microsoftGraphEmailProvider, "listMailboxes").mockResolvedValue({
      ok: true,
      mailboxes: [
        {
          providerMailboxId: "graph-ana-personal",
          address: "ana@caneycloud.com",
          displayName: "Ana Ops",
          typeHint: "personal",
        },
      ],
    });
    try {
      await expect(checkProvisioningRequestAction(request.id)).resolves.toMatchObject({ ok: true });
    } finally {
      listSpy.mockRestore();
    }

    const data = await getEmailModuleData(owner);
    const mailbox = data.mailboxes.find((item) => item.address === "ana@caneycloud.com");
    expect(mailbox).toMatchObject({
      type: "personal",
      ownerUserId: ANA_ID,
      providerMailboxId: "graph-ana-personal",
    });
    expect(data.accessGrants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mailboxId: mailbox!.id,
          userId: ANA_ID,
          canSendAs: true,
          canManageSettings: true,
        }),
      ]),
    );
    expect(data.provisioningRequests.find((item) => item.id === request.id)).toMatchObject({
      status: "completed",
      targetMailboxId: mailbox!.id,
    });
  });

  it("dedupes inbound messages by mailbox provider message id", async () => {
    const owner = sessionUser();
    await seedSandboxEmailModule(owner);
    const data = await getEmailModuleData(owner);
    const sales = data.mailboxes.find((mailbox) => mailbox.address === "sales@caneycloud.com");
    expect(sales).toBeTruthy();

    const input = {
      workspaceId: owner.workspaceId,
      mailboxId: sales!.id,
      providerThreadId: "sandbox-thread-dedupe-test",
      providerMessageId: "sandbox-message-dedupe-test",
      internetMessageId: "<sandbox-message-dedupe-test@caneycloud.com>",
      fromAddress: "dedupe@example.com",
      fromName: "Dedupe Sender",
      toRecipients: ["sales@caneycloud.com"],
      subject: "Dedupe verification",
      bodyText: "This message should only be cached once.",
      receivedAt: new Date("2026-06-07T12:00:00.000Z"),
    };
    await upsertIncomingMessage(input);
    await upsertIncomingMessage(input);

    const [count] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.emailMessages)
      .where(
        and(
          eq(schema.emailMessages.mailboxId, sales!.id),
          eq(schema.emailMessages.providerMessageId, input.providerMessageId),
        ),
      );
    expect(count.value).toBe(1);
  });

  it("links email threads to initiatives and milestones", async () => {
    const owner = sessionUser();
    await seedSandboxEmailModule(owner);
    const data = await getEmailModuleData(owner);
    const thread = data.threads.find((item) => item.mailboxAddress === "sales@caneycloud.com");
    const project = data.projects[0];
    expect(thread).toBeTruthy();
    expect(project).toBeTruthy();

    const [initiative] = await db
      .insert(schema.initiatives)
      .values({
        workspaceId: owner.workspaceId,
        title: "Email V1 launch follow-through",
        summary: "Track follow-up from shared inbox conversations.",
        status: "active",
        priority: "now",
        createdBy: owner.id,
      })
      .returning();
    // `project` is a Line of Business option; milestones attach to a child Project.
    const [childProject] = await db
      .insert(schema.projects)
      .values({
        workspaceId: owner.workspaceId,
        lobId: project!.id,
        title: project!.title,
        createdBy: owner.id,
      })
      .returning();
    const [milestone] = await db
      .insert(schema.milestones)
      .values({
        workspaceId: owner.workspaceId,
        projectId: childProject.id,
        title: "Confirm shared inbox operating model",
        createdBy: owner.id,
      })
      .returning();

    const withOptions = await getEmailModuleData(owner, thread!.id);
    expect(withOptions.initiatives).toEqual([
      expect.objectContaining({ id: initiative.id, title: initiative.title }),
    ]);
    expect(withOptions.milestones).toEqual([
      expect.objectContaining({ id: milestone.id, title: milestone.title, projectTitle: project!.title }),
    ]);

    await expect(linkEmailThreadToInitiativeAction(thread!.id, initiative.id)).resolves.toMatchObject({ ok: true });
    await expect(linkEmailThreadToMilestoneAction(thread!.id, milestone.id)).resolves.toMatchObject({ ok: true });

    const linked = await getEmailModuleData(owner, thread!.id);
    expect(linked.selectedThread?.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ linkType: "initiative", refId: initiative.id, label: initiative.title }),
        expect.objectContaining({ linkType: "milestone", refId: milestone.id, label: milestone.title }),
      ]),
    );
    expect(linked.audit.map((event) => event.action)).toEqual(
      expect.arrayContaining(["thread.link.initiative", "thread.link.milestone"]),
    );
  });

  it("keeps cached mail readable but blocks provider-backed actions during provider outage", async () => {
    const owner = sessionUser();
    await seedSandboxEmailModule(owner);
    const data = await getEmailModuleData(owner);
    const sales = data.mailboxes.find((mailbox) => mailbox.address === "sales@caneycloud.com");
    const thread = data.threads.find((item) => item.mailboxId === sales?.id);
    expect(sales).toBeTruthy();
    expect(thread).toBeTruthy();

    await db
      .update(schema.emailProviderConnections)
      .set({
        status: "degraded",
        healthStatus: "provider_outage",
        healthDetail: "Integration outage simulation",
      })
      .where(eq(schema.emailProviderConnections.id, sales!.providerConnectionId));

    const cached = await getEmailModuleData(owner, thread!.id);
    expect(cached.selectedThread?.messages.length).toBeGreaterThan(0);
    await expect(syncSandboxMailboxAction(sales!.id)).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("Email provider is degraded"),
    });
    await expect(
      setEmailThreadReadStateAction({ threadId: thread!.id, isUnread: false }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringContaining("Email provider is degraded") });
    await expect(archiveEmailThreadAction(thread!.id)).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("Email provider is degraded"),
    });
    await expect(
      sendEmailAction({
        mailboxId: sales!.id,
        threadId: thread!.id,
        to: ["marta@example.com"],
        cc: [],
        bcc: [],
        subject: `Re: ${thread!.subject}`,
        bodyText: "Provider outage send should be blocked.",
        attachments: [],
        idempotencyKey: "send-provider-outage-key",
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.stringContaining("Email provider is degraded") });

    const afterBlocked = await getEmailModuleData(owner, thread!.id);
    expect(afterBlocked.selectedThread?.isUnread).toBe(thread!.isUnread);
    expect(afterBlocked.selectedThread?.status).toBe(thread!.status);
    expect(afterBlocked.audit.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "sync.blocked_provider_unavailable",
        "thread.read_state.blocked_provider_unavailable",
        "thread.archive.blocked_provider_unavailable",
        "send.blocked_provider_unavailable",
      ]),
    );
  });

  it("does not sync Graph webhook notifications while provider is degraded", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const previousClientState = process.env.EMAIL_GRAPH_WEBHOOK_CLIENT_STATE;
    process.env.EMAIL_GRAPH_WEBHOOK_CLIENT_STATE = "graph-test-state";
    try {
      const [provider] = await db
        .insert(schema.emailProviderConnections)
        .values({
          workspaceId: FAKE_WORKSPACE_ID,
          provider: "microsoft_365",
          domain: "caneycloud.com",
          status: "degraded",
          healthStatus: "provider_outage",
          healthDetail: "Webhook outage simulation",
        })
        .returning();
      const [mailbox] = await db
        .insert(schema.emailMailboxes)
        .values({
          workspaceId: FAKE_WORKSPACE_ID,
          providerConnectionId: provider.id,
          address: "sales@caneycloud.com",
          displayName: "Sales",
          type: "shared",
          providerMailboxId: "graph-user-123",
        })
        .returning();

      const response = await graphWebhookPost(
        new Request("https://crm.test/api/email/graph/webhook", {
          method: "POST",
          body: JSON.stringify({
            value: [
              {
                clientState: "graph-test-state",
                resource: "users/graph-user-123/messages",
                changeType: "created",
              },
            ],
          }),
        }),
      );
      const payload = (await response.json()) as { ok: boolean; synced: number; unmatched: number };
      expect(payload).toMatchObject({ ok: true, synced: 0, unmatched: 1 });

      const [after] = await db
        .select({ lastSyncedAt: schema.emailMailboxes.lastSyncedAt })
        .from(schema.emailMailboxes)
        .where(eq(schema.emailMailboxes.id, mailbox.id))
        .limit(1);
      expect(after.lastSyncedAt).toBeNull();
      const audit = await db.select().from(schema.emailAuditEvents);
      expect(audit.map((event) => event.action)).toContain("provider.graph.notification");
    } finally {
      if (previousClientState === undefined) {
        delete process.env.EMAIL_GRAPH_WEBHOOK_CLIENT_STATE;
      } else {
        process.env.EMAIL_GRAPH_WEBHOOK_CLIENT_STATE = previousClientState;
      }
      errorSpy.mockRestore();
    }
  });

  it("runs shared sync helper without duplicating sandbox cache state", async () => {
    const owner = sessionUser();
    await seedSandboxEmailModule(owner);
    const data = await getEmailModuleData(owner);
    const sales = data.mailboxes.find((mailbox) => mailbox.address === "sales@caneycloud.com");
    expect(sales).toBeTruthy();

    const result = await syncMailboxCache({
      mailbox: sales!,
      providerKind: "sandbox",
      actorId: owner.id,
    });

    expect(result).toEqual({ ok: true, messageCount: 0 });
    const refreshed = await getEmailModuleData(owner);
    expect(refreshed.mailboxes.find((mailbox) => mailbox.id === sales!.id)?.lastSyncError).toBeNull();
  });

  it("persists drafts, bulk-triages threads, and stores outbound attachment metadata", async () => {
    const owner = sessionUser();
    await seedSandboxEmailModule(owner);
    const data = await getEmailModuleData(owner);
    const sales = data.mailboxes.find((mailbox) => mailbox.address === "sales@caneycloud.com");
    const salesThreads = data.threads.filter((thread) => thread.mailboxId === sales?.id);
    expect(sales).toBeTruthy();
    expect(salesThreads.length).toBeGreaterThanOrEqual(2);

    const attachment = {
      filename: "proposal-note.txt",
      mimeType: "text/plain",
      sizeBytes: 12,
      contentBase64: "QXR0YWNoZWQu",
    };
    const draftResult = await saveEmailDraftAction({
      mailboxId: sales!.id,
      threadId: salesThreads[0].id,
      to: ["marta@example.com"],
      cc: [],
      bcc: [],
      subject: `Re: ${salesThreads[0].subject}`,
      bodyText: "Draft saved from integration test.",
      attachments: [attachment],
      clientMutationId: "draft-integration-key",
    });
    expect(draftResult).toMatchObject({ ok: true });
    if (!draftResult.ok) throw new Error(draftResult.error);

    const withDraft = await getEmailModuleData(owner, salesThreads[0].id);
    const draft = withDraft.drafts.find((item) => item.id === draftResult.id);
    expect(draft).toMatchObject({
      bodyText: "Draft saved from integration test.",
      attachmentMetadata: [expect.objectContaining({ filename: "proposal-note.txt" })],
    });

    const bulkResult = await bulkUpdateEmailThreadsAction({
      threadIds: [salesThreads[0].id, salesThreads[1].id],
      status: "done",
      assigneeUserId: ANA_ID,
    });
    expect(bulkResult).toMatchObject({ ok: true });
    const afterBulk = await getEmailModuleData(owner);
    expect(afterBulk.threads.filter((thread) => [salesThreads[0].id, salesThreads[1].id].includes(thread.id))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "done", assignedToId: ANA_ID }),
        expect.objectContaining({ status: "done", assignedToId: ANA_ID }),
      ]),
    );
    await expect(updateEmailThreadStatusAction(salesThreads[1].id, "snoozed")).resolves.toMatchObject({ ok: true });
    const afterSnooze = await getEmailModuleData(owner);
    expect(afterSnooze.threads.find((thread) => thread.id === salesThreads[1].id)).toMatchObject({
      status: "snoozed",
      snoozedUntil: expect.any(Date),
    });
    await expect(
      setEmailThreadReadStateAction({ threadId: salesThreads[1].id, isUnread: false }),
    ).resolves.toMatchObject({ ok: true });
    const afterRead = await getEmailModuleData(owner);
    expect(afterRead.threads.find((thread) => thread.id === salesThreads[1].id)?.isUnread).toBe(false);
    await expect(archiveEmailThreadAction(salesThreads[1].id)).resolves.toMatchObject({ ok: true });
    const afterArchive = await getEmailModuleData(owner);
    expect(afterArchive.threads.find((thread) => thread.id === salesThreads[1].id)).toMatchObject({
      status: "done",
      isUnread: false,
    });
    const archivedMessages = await db
      .select()
      .from(schema.emailMessages)
      .where(
        and(
          eq(schema.emailMessages.threadId, salesThreads[1].id),
          eq(schema.emailMessages.direction, "inbound"),
        ),
      );
    expect(archivedMessages).toEqual([
      expect.objectContaining({ providerFolder: "archive", isRead: true }),
    ]);

    await expect(updateMailboxSignatureAction(sales!.id, "--\nCaneyCloud")).resolves.toMatchObject({ ok: true });

    const sendResult = await sendEmailAction({
      draftId: draft!.id,
      mailboxId: sales!.id,
      threadId: salesThreads[0].id,
      to: ["marta@example.com"],
      cc: [],
      bcc: [],
      subject: `Re: ${salesThreads[0].subject}`,
      bodyText: "Sending with a real sandbox attachment payload.",
      attachments: [attachment],
      idempotencyKey: "send-integration-attachment-key",
    });
    expect(sendResult).toMatchObject({ ok: true });
    const detail = await getEmailModuleData(owner, salesThreads[0].id);
    expect(detail.threads.find((thread) => thread.id === salesThreads[0].id)).toMatchObject({
      hasOutboundMessage: true,
      lastMessageDirection: "outbound",
      lastProviderFolder: "sent",
    });
    const outbound = detail.selectedThread?.messages.find(
      (message) => message.direction === "outbound" && message.providerMessageId.includes("send-integration-attachment-key"),
    );
    expect(outbound?.bodyText).toContain("--\nCaneyCloud");
    expect(outbound?.attachments).toEqual([
      expect.objectContaining({ filename: "proposal-note.txt", mimeType: "text/plain" }),
    ]);
    expect(detail.drafts.find((item) => item.id === draft!.id)).toBeUndefined();
  });

  it("enforces AI policy and records AI-generated reply drafts with citations", async () => {
    const owner = sessionUser();
    await seedSandboxEmailModule(owner);
    const data = await getEmailModuleData(owner);
    const sharedThread = data.threads.find((thread) => thread.mailboxAddress === "sales@caneycloud.com");
    const personalThread = data.threads.find((thread) => thread.mailboxAddress === "ana@caneycloud.com");
    expect(sharedThread).toBeTruthy();
    expect(personalThread).toBeTruthy();

    await expect(
      generateEmailActiveBrainAction({ threadId: personalThread!.id, mode: "summary" }),
    ).resolves.toMatchObject({ ok: false, error: "AI is disabled for this mailbox by policy." });

    const summary = await generateEmailActiveBrainAction({ threadId: sharedThread!.id, mode: "summary" });
    expect(summary).toMatchObject({
      ok: true,
      summary: {
        citations: [expect.objectContaining({ messageId: expect.any(String) })],
        nextAction: expect.any(String),
      },
    });

    const draftResult = await generateEmailActiveBrainAction({ threadId: sharedThread!.id, mode: "draft" });
    expect(draftResult).toMatchObject({ ok: true, draftId: expect.any(String), draftBody: expect.stringContaining("Hi") });
    if (!draftResult.ok || !draftResult.draftId) throw new Error("AI draft was not created");
    const [draft] = await db
      .select()
      .from(schema.emailDrafts)
      .where(eq(schema.emailDrafts.id, draftResult.draftId))
      .limit(1);
    expect(draft).toMatchObject({
      aiGenerated: true,
      threadId: sharedThread!.id,
      aiMetadata: expect.objectContaining({
        sourceThreadId: sharedThread!.id,
        citations: expect.any(Array),
      }),
    });

    await expect(getEmailWorkloadBriefingAction()).resolves.toMatchObject({
      ok: true,
      briefing: {
        topNextActions: expect.any(Array),
      },
    });
  });
});
