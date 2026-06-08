import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SessionUser } from "@/lib/current-user";
import {
  auditEmailEvent,
  linkEmailThread,
  recalculateMailboxCounts,
  upsertIncomingMessage,
} from "@/db/queries/email";

const ANA_ID = "10000000-0000-4000-8000-000000000001";
const DIEGO_ID = "10000000-0000-4000-8000-000000000002";
const MARIA_ID = "10000000-0000-4000-8000-000000000003";

const dayMs = 24 * 60 * 60 * 1000;

async function ensureTeam(user: SessionUser) {
  const rows = [
    { id: ANA_ID, email: "ana@caneycloud.com", displayName: "Ana Ops", role: "member" as const },
    { id: DIEGO_ID, email: "diego@caneycloud.com", displayName: "Diego Sales", role: "member" as const },
    { id: MARIA_ID, email: "maria@caneycloud.com", displayName: "Maria Support", role: "admin" as const },
  ];
  for (const row of rows) {
    await db
      .insert(schema.users)
      .values({ id: row.id, email: row.email, displayName: row.displayName })
      .onConflictDoUpdate({
        target: schema.users.id,
        set: { email: row.email, displayName: row.displayName },
      });
    await db
      .insert(schema.workspaceMembers)
      .values({ workspaceId: user.workspaceId, userId: row.id, role: row.role })
      .onConflictDoNothing();
  }
}

async function ensureProvider(user: SessionUser) {
  const [provider] = await db
    .insert(schema.emailProviderConnections)
    .values({
      workspaceId: user.workspaceId,
      provider: "sandbox",
      domain: "caneycloud.com",
      status: "connected",
      healthStatus: "healthy",
      healthDetail: "Sandbox mail provider seeded. Microsoft 365 adapter remains available for production.",
      lastHealthAt: new Date(),
      connectedBy: user.id,
      connectedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        schema.emailProviderConnections.workspaceId,
        schema.emailProviderConnections.provider,
        schema.emailProviderConnections.domain,
      ],
      set: {
        status: "connected",
        healthStatus: "healthy",
        lastHealthAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();
  return provider;
}

async function ensureMailbox(input: {
  workspaceId: string;
  providerConnectionId: string;
  address: string;
  displayName: string;
  type: "personal" | "shared" | "system";
  ownerUserId?: string | null;
  aiEnabled?: boolean;
  sendAsDeniedUserIds?: string[];
}) {
  const [mailbox] = await db
    .insert(schema.emailMailboxes)
    .values({
      workspaceId: input.workspaceId,
      providerConnectionId: input.providerConnectionId,
      address: input.address,
      displayName: input.displayName,
      type: input.type,
      ownerUserId: input.ownerUserId ?? null,
      providerMailboxId: `sandbox:${input.address}`,
      aiEnabled: input.aiEnabled ?? input.type === "shared",
      signature: `--\n${input.displayName}\nCaneyCloud`,
      providerMetadata: {
        folders: ["Inbox", "Sent Items", "Archive"],
        sendAsDeniedUserIds: input.sendAsDeniedUserIds ?? [],
      },
    })
    .onConflictDoUpdate({
      target: [schema.emailMailboxes.workspaceId, schema.emailMailboxes.address],
      set: {
        displayName: input.displayName,
        type: input.type,
        ownerUserId: input.ownerUserId ?? null,
        aiEnabled: input.aiEnabled ?? input.type === "shared",
        providerMetadata: {
          folders: ["Inbox", "Sent Items", "Archive"],
          sendAsDeniedUserIds: input.sendAsDeniedUserIds ?? [],
        },
        updatedAt: new Date(),
      },
    })
    .returning();
  return mailbox;
}

async function grant(input: {
  workspaceId: string;
  mailboxId: string;
  userId: string;
  actorId: string;
  view?: boolean;
  reply?: boolean;
  sendAs?: boolean;
  assign?: boolean;
  manageAccess?: boolean;
  manageSettings?: boolean;
}) {
  await db
    .insert(schema.emailMailboxAccess)
    .values({
      workspaceId: input.workspaceId,
      mailboxId: input.mailboxId,
      userId: input.userId,
      canView: input.view ?? true,
      canReply: input.reply ?? false,
      canSendAs: input.sendAs ?? false,
      canAssign: input.assign ?? false,
      canManageAccess: input.manageAccess ?? false,
      canManageSettings: input.manageSettings ?? false,
      grantedBy: input.actorId,
    })
    .onConflictDoUpdate({
      target: [schema.emailMailboxAccess.mailboxId, schema.emailMailboxAccess.userId],
      set: {
        canView: input.view ?? true,
        canReply: input.reply ?? false,
        canSendAs: input.sendAs ?? false,
        canAssign: input.assign ?? false,
        canManageAccess: input.manageAccess ?? false,
        canManageSettings: input.manageSettings ?? false,
        grantedBy: input.actorId,
        grantedAt: new Date(),
      },
    });
}

async function ensureContact(input: {
  workspaceId: string;
  actorId: string;
  name: string;
  organization: string;
  email: string;
}) {
  const [existing] = await db
    .select({ contact: schema.contacts })
    .from(schema.contactChannels)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.contactChannels.contactId))
    .where(
      and(
        eq(schema.contacts.workspaceId, input.workspaceId),
        eq(schema.contactChannels.kind, "email"),
        eq(schema.contactChannels.value, input.email),
      ),
    )
    .limit(1);
  if (existing) return existing.contact;
  const [contact] = await db
    .insert(schema.contacts)
    .values({
      workspaceId: input.workspaceId,
      name: input.name,
      organization: input.organization,
      relationshipType: "lead",
      createdBy: input.actorId,
    })
    .returning();
  await db.insert(schema.contactChannels).values({
    contactId: contact.id,
    kind: "email",
    value: input.email,
    isPrimary: true,
  });
  return contact;
}

async function ensureProject(input: {
  workspaceId: string;
  actorId: string;
  title: string;
  statusText: string;
}) {
  const [existing] = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.workspaceId, input.workspaceId),
        eq(schema.projects.title, input.title),
      ),
    )
    .limit(1);
  if (existing) return existing;
  const [project] = await db
    .insert(schema.projects)
    .values({
      workspaceId: input.workspaceId,
      title: input.title,
      status: "active",
      statusText: input.statusText,
      createdBy: input.actorId,
    })
    .returning();
  return project;
}

export async function seedSandboxEmailModule(user: SessionUser) {
  await ensureTeam(user);
  const provider = await ensureProvider(user);
  const [tomas, sales, ops, support, ana, finance] = await Promise.all([
    ensureMailbox({
      workspaceId: user.workspaceId,
      providerConnectionId: provider.id,
      address: "tomas@caneycloud.com",
      displayName: "Tomas",
      type: "personal",
      ownerUserId: user.id,
      aiEnabled: false,
    }),
    ensureMailbox({
      workspaceId: user.workspaceId,
      providerConnectionId: provider.id,
      address: "sales@caneycloud.com",
      displayName: "Sales",
      type: "shared",
      aiEnabled: true,
    }),
    ensureMailbox({
      workspaceId: user.workspaceId,
      providerConnectionId: provider.id,
      address: "ops@caneycloud.com",
      displayName: "Operations",
      type: "shared",
      aiEnabled: true,
      sendAsDeniedUserIds: ["*"],
    }),
    ensureMailbox({
      workspaceId: user.workspaceId,
      providerConnectionId: provider.id,
      address: "support@caneycloud.com",
      displayName: "Support",
      type: "shared",
      aiEnabled: true,
    }),
    ensureMailbox({
      workspaceId: user.workspaceId,
      providerConnectionId: provider.id,
      address: "ana@caneycloud.com",
      displayName: "Ana",
      type: "personal",
      ownerUserId: ANA_ID,
      aiEnabled: false,
    }),
    ensureMailbox({
      workspaceId: user.workspaceId,
      providerConnectionId: provider.id,
      address: "finance@caneycloud.com",
      displayName: "Finance",
      type: "shared",
      aiEnabled: false,
    }),
  ]);

  const allMailboxIds = [tomas, sales, ops, support, ana, finance].map((m) => m.id);
  for (const mailbox of [tomas, sales, ops, support, ana, finance]) {
    await grant({
      workspaceId: user.workspaceId,
      mailboxId: mailbox.id,
      userId: user.id,
      actorId: user.id,
      view: true,
      reply: true,
      sendAs: true,
      assign: true,
      manageAccess: true,
      manageSettings: true,
    });
  }
  await grant({
    workspaceId: user.workspaceId,
    mailboxId: sales.id,
    userId: DIEGO_ID,
    actorId: user.id,
    reply: true,
    sendAs: true,
    assign: true,
  });
  await grant({
    workspaceId: user.workspaceId,
    mailboxId: support.id,
    userId: ANA_ID,
    actorId: user.id,
    reply: true,
    assign: true,
  });
  await grant({
    workspaceId: user.workspaceId,
    mailboxId: ops.id,
    userId: MARIA_ID,
    actorId: user.id,
    reply: true,
    sendAs: true,
    assign: true,
    manageAccess: true,
  });

  const [marta, victor] = await Promise.all([
    ensureContact({
      workspaceId: user.workspaceId,
      actorId: user.id,
      name: "Marta Lopez",
      organization: "Posada La Rosa",
      email: "marta@example.com",
    }),
    ensureContact({
      workspaceId: user.workspaceId,
      actorId: user.id,
      name: "Victor Andrade",
      organization: "Orinoco Partners",
      email: "victor@example.com",
    }),
  ]);
  const [caneyProject, supportProject] = await Promise.all([
    ensureProject({
      workspaceId: user.workspaceId,
      actorId: user.id,
      title: "CaneyCloud - Posada La Rosa onboarding",
      statusText: "Discovery call ready",
    }),
    ensureProject({
      workspaceId: user.workspaceId,
      actorId: user.id,
      title: "Support - Q3 operator issues",
      statusText: "Shared inbox workflow",
    }),
  ]);

  const first = await upsertIncomingMessage({
    workspaceId: user.workspaceId,
    mailboxId: sales.id,
    providerThreadId: "sandbox-thread-sales-marta",
    providerMessageId: "sandbox-msg-sales-marta-1",
    internetMessageId: "<sandbox-sales-marta-1@caneycloud.com>",
    fromAddress: "marta@example.com",
    fromName: "Marta Lopez",
    toRecipients: ["sales@caneycloud.com"],
    subject: "CaneyCloud demo for Posada La Rosa",
    bodyText:
      "Tomas, we are ready to see the CaneyCloud demo. Can you send a proposal and available slots for Friday?",
    receivedAt: new Date(Date.now() - 2 * dayMs),
    attachments: [
      {
        providerAttachmentId: "sandbox-attachment-marta-rates",
        filename: "current-room-rates.pdf",
        mimeType: "application/pdf",
        sizeBytes: 428_000,
      },
    ],
  });
  await upsertIncomingMessage({
    workspaceId: user.workspaceId,
    mailboxId: sales.id,
    providerThreadId: "sandbox-thread-victor",
    providerMessageId: "sandbox-msg-victor-1",
    internetMessageId: "<sandbox-victor-1@caneycloud.com>",
    fromAddress: "victor@example.com",
    fromName: "Victor Andrade",
    toRecipients: ["sales@caneycloud.com"],
    subject: "Partnership intro - Orinoco operators",
    bodyText:
      "We can introduce three operators next week. Please share the operating model and pricing before the call.",
    receivedAt: new Date(Date.now() - dayMs),
  });
  await upsertIncomingMessage({
    workspaceId: user.workspaceId,
    mailboxId: support.id,
    providerThreadId: "sandbox-thread-support-login",
    providerMessageId: "sandbox-msg-support-login-1",
    internetMessageId: "<sandbox-support-login-1@caneycloud.com>",
    fromAddress: "frontdesk@example.com",
    fromName: "Front Desk Team",
    toRecipients: ["support@caneycloud.com"],
    subject: "Night audit login issue",
    bodyText:
      "The night audit user cannot sign in after the password reset. Can support look at this before tonight?",
    receivedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
  });
  await upsertIncomingMessage({
    workspaceId: user.workspaceId,
    mailboxId: ana.id,
    providerThreadId: "sandbox-thread-ana-private",
    providerMessageId: "sandbox-msg-ana-private-1",
    internetMessageId: "<sandbox-ana-private-1@caneycloud.com>",
    fromAddress: "vendor@example.com",
    fromName: "Vendor",
    toRecipients: ["ana@caneycloud.com"],
    subject: "Ops vendor renewal",
    bodyText:
      "Ana, the renewal quote is attached. Please confirm if the company wants the annual plan.",
    receivedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
  });

  if (first.threadId) {
    await linkEmailThread({
      workspaceId: user.workspaceId,
      actorId: user.id,
      threadId: first.threadId,
      linkType: "contact",
      refId: marta.id,
      label: marta.name,
    });
    await linkEmailThread({
      workspaceId: user.workspaceId,
      actorId: user.id,
      threadId: first.threadId,
      linkType: "project",
      refId: caneyProject.id,
      label: caneyProject.title,
    });
  }
  const victorThread = await db
    .select()
    .from(schema.emailThreads)
    .where(
      and(
        eq(schema.emailThreads.workspaceId, user.workspaceId),
        eq(schema.emailThreads.providerThreadId, "sandbox-thread-victor"),
      ),
    )
    .limit(1);
  if (victorThread[0]) {
    await linkEmailThread({
      workspaceId: user.workspaceId,
      actorId: user.id,
      threadId: victorThread[0].id,
      linkType: "contact",
      refId: victor.id,
      label: victor.name,
    });
  }
  const supportThread = await db
    .select()
    .from(schema.emailThreads)
    .where(
      and(
        eq(schema.emailThreads.workspaceId, user.workspaceId),
        eq(schema.emailThreads.providerThreadId, "sandbox-thread-support-login"),
      ),
    )
    .limit(1);
  if (supportThread[0]) {
    await linkEmailThread({
      workspaceId: user.workspaceId,
      actorId: user.id,
      threadId: supportThread[0].id,
      linkType: "project",
      refId: supportProject.id,
      label: supportProject.title,
    });
  }

  await recalculateMailboxCounts(user.workspaceId, allMailboxIds);
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "sandbox.seeded",
    metadata: {
      provider: "sandbox",
      mailboxes: allMailboxIds.length,
      launchInboxes: ["sales@caneycloud.com", "ops@caneycloud.com", "support@caneycloud.com"],
    },
  });
}
