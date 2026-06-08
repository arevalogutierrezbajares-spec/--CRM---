"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import {
  auditEmailEvent,
  createTouchFromThread,
  findOrCreateContactFromEmail,
  getEmailThreadDetail,
  getMailboxForAction,
  getThreadForAction,
  linkEmailThread,
  listEmailThreadsForUser,
  notifyEmailAssignment,
  recalculateMailboxCounts,
  upsertIncomingMessage,
} from "@/db/queries/email";
import { seedSandboxEmailModule } from "@/db/queries/email-sandbox";
import { requireUser } from "@/lib/current-user";
import { canProviderSendAs } from "@/lib/email/access";
import {
  buildEmailAiDraft,
  buildEmailAiSummary,
  buildEmailWorkloadBriefing,
  type EmailAiSummary,
  type EmailWorkloadBriefing,
} from "@/lib/email/active-brain";
import { normalizeEmail, previewText, splitEmails } from "@/lib/email/format";
import { getEmailProvider } from "@/lib/email/provider";
import { syncMailboxCache } from "@/lib/email/sync";
import type {
  EmailAttachmentInput,
  MailboxRecord,
  MailboxRights,
  ProviderMailbox,
  ProviderMailboxPermissionGrant,
  ProviderProvisioningResult,
} from "@/lib/email/types";

export type EmailActionResult =
  | { ok: true; id?: string; message?: string }
  | { ok: false; error: string };

export type EmailActiveBrainResult =
  | {
      ok: true;
      summary: EmailAiSummary;
      draftId?: string;
      draftBody?: string;
      message?: string;
    }
  | { ok: false; error: string };

export type EmailWorkloadBriefingResult =
  | { ok: true; briefing: EmailWorkloadBriefing }
  | { ok: false; error: string };

const threadStatusSchema = z.enum(["open", "waiting", "done", "snoozed"]);
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 512 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 512 * 1024;
const DEFAULT_SNOOZE_MS = 24 * 60 * 60 * 1000;

const attachmentSchema = z.object({
  filename: z.string().trim().min(1).max(180),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
  contentBase64: z.string().max(Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 128).optional(),
});

function validateAttachmentLimits(
  attachments: EmailAttachmentInput[],
  ctx: z.RefinementCtx,
  requireContent: boolean,
) {
  const totalBytes = attachments.reduce((sum, attachment) => sum + attachment.sizeBytes, 0);
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Attachments must be under 512 KB total for V1 sends.",
      path: ["attachments"],
    });
  }
  if (requireContent) {
    attachments.forEach((attachment, index) => {
      if (!attachment.contentBase64) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Re-attach this file before sending.",
          path: ["attachments", index],
        });
      }
    });
  }
}

const sendSchema = z.object({
  draftId: z.string().uuid().nullable().optional(),
  mailboxId: z.string().uuid(),
  threadId: z.string().uuid().nullable().optional(),
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).default([]),
  bcc: z.array(z.string().email()).default([]),
  subject: z.string().trim().min(1).max(250),
  bodyText: z.string().trim().min(1).max(20_000),
  idempotencyKey: z.string().trim().min(8).max(160),
  attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).default([]),
}).superRefine((value, ctx) => validateAttachmentLimits(value.attachments, ctx, true));

const draftSchema = z.object({
  draftId: z.string().uuid().nullable().optional(),
  mailboxId: z.string().uuid(),
  threadId: z.string().uuid().nullable().optional(),
  to: z.array(z.string().email()).default([]),
  cc: z.array(z.string().email()).default([]),
  bcc: z.array(z.string().email()).default([]),
  subject: z.string().trim().max(250).default(""),
  bodyText: z.string().max(20_000).default(""),
  clientMutationId: z.string().trim().min(8).max(160),
  attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).default([]),
}).superRefine((value, ctx) => validateAttachmentLimits(value.attachments, ctx, false));

const bulkThreadUpdateSchema = z.object({
  threadIds: z.array(z.string().uuid()).min(1).max(100),
  status: threadStatusSchema.optional(),
  assigneeUserId: z.string().uuid().nullable().optional(),
}).refine((value) => value.status || value.assigneeUserId !== undefined, {
  message: "Choose a bulk action.",
});

const readStateSchema = z.object({
  threadId: z.string().uuid(),
  isUnread: z.boolean(),
});

const activeBrainSchema = z.object({
  threadId: z.string().uuid(),
  mode: z.enum(["summary", "draft"]).default("summary"),
});

const mailboxTypeSchema = z.enum(["personal", "shared", "system"]);

const provisionSharedInboxSchema = z.object({
  address: z.string().trim().email().max(180),
  displayName: z.string().trim().min(1).max(120),
  userIds: z.array(z.string().uuid()).max(50).default([]),
});

const provisionTeamMemberSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(180),
  temporaryPassword: z
    .union([z.string().trim().min(12).max(128), z.literal("")])
    .optional()
    .transform((value) => (value ? value : undefined)),
  usageLocation: z
    .union([z.string().trim().length(2), z.literal("")])
    .optional()
    .transform((value) => (value ? value.toUpperCase() : undefined)),
});

const classifyMailboxSchema = z.object({
  mailboxId: z.string().uuid(),
  type: mailboxTypeSchema,
  ownerUserId: z.string().uuid().nullable().optional(),
});

const checkProvisioningRequestSchema = z.string().uuid();

type DesiredAccessGrant = {
  userId: string;
  userEmail?: string;
  fullAccess: boolean;
  sendAs: boolean;
  rights: MailboxRights;
};

const OWNER_RIGHTS: MailboxRights = {
  canView: true,
  canReply: true,
  canSendAs: true,
  canAssign: true,
  canManageAccess: true,
  canManageSettings: true,
};

const RESPONDER_RIGHTS: MailboxRights = {
  canView: true,
  canReply: true,
  canSendAs: true,
  canAssign: true,
  canManageAccess: false,
  canManageSettings: false,
};

type EmailProviderKind = "sandbox" | "microsoft_365" | "zoho_mail";

function providerDisplayName(provider: EmailProviderKind) {
  if (provider === "microsoft_365") return "Microsoft 365";
  if (provider === "zoho_mail") return "Zoho Mail";
  return "Sandbox";
}

function ensureCaneyCloudAddress(value: string) {
  const address = normalizeEmail(value);
  if (!address.endsWith("@caneycloud.com")) {
    return { ok: false as const, error: "Use a caneycloud.com mailbox address." };
  }
  return { ok: true as const, address };
}

function providerGrantsFromDesired(desiredAccess: DesiredAccessGrant[]): ProviderMailboxPermissionGrant[] {
  return desiredAccess.map((grant) => ({
    userId: grant.userId,
    userEmail: grant.userEmail ?? grant.userId,
    fullAccess: grant.fullAccess,
    sendAs: grant.sendAs,
  }));
}

function resultMetadata(result: ProviderProvisioningResult) {
  return result.ok
    ? {
        mode: result.mode,
        message: result.message,
        providerUserId: result.providerUserId,
        providerRequestId: result.providerRequestId,
        manualSteps: result.manualSteps ?? [],
        metadata: result.metadata ?? {},
      }
    : {
        error: result.error,
        providerStatus: result.providerStatus,
        manualSteps: result.manualSteps ?? [],
        metadata: result.metadata ?? {},
      };
}

function requireEmailAdmin(user: Awaited<ReturnType<typeof requireUser>>) {
  return user.workspaceRole === "owner" || user.workspaceRole === "admin";
}

async function getActiveProviderConnection(user: Awaited<ReturnType<typeof requireUser>>) {
  const [providerConnection] = await db
    .select()
    .from(schema.emailProviderConnections)
    .where(eq(schema.emailProviderConnections.workspaceId, user.workspaceId))
    .orderBy(desc(schema.emailProviderConnections.createdAt))
    .limit(1);
  return providerConnection ?? null;
}

async function requireProvisioningProvider(input: {
  user: Awaited<ReturnType<typeof requireUser>>;
  action: string;
}) {
  const providerConnection = await getActiveProviderConnection(input.user);
  if (!providerConnection) {
    return { ok: false as const, error: "Connect Zoho Mail, Microsoft 365, or load the sandbox provider first." };
  }
  if (providerConnection.status !== "connected") {
    await auditEmailEvent({
      workspaceId: input.user.workspaceId,
      actorId: input.user.id,
      action: input.action,
      metadata: {
        provider: providerConnection.provider,
        status: providerConnection.status,
        healthStatus: providerConnection.healthStatus,
        healthDetail: providerConnection.healthDetail,
      },
    });
    return {
      ok: false as const,
      error: `Email provider is ${providerConnection.status}. Provisioning is disabled until provider health is restored.`,
    };
  }
  return { ok: true as const, providerConnection };
}

async function loadMembersByIds(user: Awaited<ReturnType<typeof requireUser>>, userIds: string[]) {
  if (userIds.length === 0) return [];
  const rows = await db
    .select({
      userId: schema.users.id,
      email: schema.users.email,
      displayName: schema.users.displayName,
      role: schema.workspaceMembers.role,
    })
    .from(schema.workspaceMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, user.workspaceId),
        inArray(schema.workspaceMembers.userId, userIds),
      ),
    );
  return rows;
}

async function upsertMailboxFromProvider(input: {
  user: Awaited<ReturnType<typeof requireUser>>;
  providerConnectionId: string;
  providerMailbox: ProviderMailbox;
  type: "personal" | "shared" | "system";
  ownerUserId?: string | null;
  aiEnabled?: boolean;
}) {
  const [mailbox] = await db
    .insert(schema.emailMailboxes)
    .values({
      workspaceId: input.user.workspaceId,
      providerConnectionId: input.providerConnectionId,
      address: input.providerMailbox.address,
      displayName: input.providerMailbox.displayName,
      type: input.type,
      providerMailboxId: input.providerMailbox.providerMailboxId,
      ownerUserId: input.ownerUserId ?? null,
      aiEnabled: input.aiEnabled ?? input.type === "shared",
      providerMetadata: input.providerMailbox.metadata ?? {},
    })
    .onConflictDoUpdate({
      target: [schema.emailMailboxes.workspaceId, schema.emailMailboxes.address],
      set: {
        providerConnectionId: input.providerConnectionId,
        displayName: input.providerMailbox.displayName,
        type: input.type,
        providerMailboxId: input.providerMailbox.providerMailboxId,
        ownerUserId: input.ownerUserId ?? null,
        aiEnabled: input.aiEnabled ?? input.type === "shared",
        providerMetadata: input.providerMailbox.metadata ?? {},
        updatedAt: new Date(),
      },
    })
    .returning();
  return mailbox;
}

async function mirrorDesiredCrmAccess(input: {
  user: Awaited<ReturnType<typeof requireUser>>;
  mailboxId: string;
  desiredAccess: DesiredAccessGrant[];
  auditAction: string;
}) {
  for (const grant of input.desiredAccess) {
    await db
      .insert(schema.emailMailboxAccess)
      .values({
        workspaceId: input.user.workspaceId,
        mailboxId: input.mailboxId,
        userId: grant.userId,
        canView: grant.rights.canView,
        canReply: grant.rights.canReply,
        canSendAs: grant.rights.canSendAs,
        canAssign: grant.rights.canAssign,
        canManageAccess: grant.rights.canManageAccess,
        canManageSettings: grant.rights.canManageSettings,
        grantedBy: input.user.id,
      })
      .onConflictDoUpdate({
        target: [schema.emailMailboxAccess.mailboxId, schema.emailMailboxAccess.userId],
        set: {
          canView: grant.rights.canView,
          canReply: grant.rights.canReply,
          canSendAs: grant.rights.canSendAs,
          canAssign: grant.rights.canAssign,
          canManageAccess: grant.rights.canManageAccess,
          canManageSettings: grant.rights.canManageSettings,
          grantedBy: input.user.id,
          grantedAt: new Date(),
        },
      });
  }
  await auditEmailEvent({
    workspaceId: input.user.workspaceId,
    actorId: input.user.id,
    mailboxId: input.mailboxId,
    action: input.auditAction,
    metadata: {
      grants: input.desiredAccess.map((grant) => ({
        userId: grant.userId,
        fullAccess: grant.fullAccess,
        sendAs: grant.sendAs,
        rights: grant.rights,
      })),
    },
  });
}

async function ensureCrmUserAndMembership(input: {
  workspaceId: string;
  email: string;
  displayName: string;
}) {
  const email = normalizeEmail(input.email);
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  const user =
    existing ??
    (
      await db
        .insert(schema.users)
        .values({
          id: crypto.randomUUID(),
          email,
          displayName: input.displayName,
          currentWorkspaceId: input.workspaceId,
        })
        .returning()
    )[0];
  await db
    .insert(schema.workspaceMembers)
    .values({
      workspaceId: input.workspaceId,
      userId: user.id,
      role: "member",
    })
    .onConflictDoNothing();
  return user;
}

export async function initializeSandboxEmailAction(): Promise<EmailActionResult> {
  const user = await requireUser();
  await seedSandboxEmailModule(user);
  revalidatePath("/email");
  return { ok: true, message: "Sandbox email module seeded." };
}

export async function connectMicrosoftProviderAction(): Promise<EmailActionResult> {
  const user = await requireUser();
  if (user.workspaceRole !== "owner") return { ok: false, error: "Only owners can connect Microsoft 365." };
  const provider = getEmailProvider("microsoft_365");
  const health = await provider.health();
  if (!health.ok) return { ok: false, error: health.detail };
  await db
    .insert(schema.emailProviderConnections)
    .values({
      workspaceId: user.workspaceId,
      provider: "microsoft_365",
      domain: "caneycloud.com",
      status: "connected",
      healthStatus: "healthy",
      healthDetail: health.detail,
      lastHealthAt: new Date(),
      connectedBy: user.id,
      connectedAt: new Date(),
      tenantId: process.env.MS_GRAPH_TENANT_ID ?? null,
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
        healthDetail: health.detail,
        lastHealthAt: new Date(),
        updatedAt: new Date(),
      },
    });
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "provider.microsoft.connected",
  });
  revalidatePath("/email");
  return { ok: true, message: "Microsoft 365 provider connected." };
}

export async function connectZohoProviderAction(): Promise<EmailActionResult> {
  const user = await requireUser();
  if (user.workspaceRole !== "owner") return { ok: false, error: "Only owners can connect Zoho Mail." };
  const provider = getEmailProvider("zoho_mail");
  const health = await provider.health();
  if (!health.ok) return { ok: false, error: health.detail };
  await db
    .insert(schema.emailProviderConnections)
    .values({
      workspaceId: user.workspaceId,
      provider: "zoho_mail",
      domain: "caneycloud.com",
      status: "connected",
      healthStatus: "healthy",
      healthDetail: health.detail,
      lastHealthAt: new Date(),
      connectedBy: user.id,
      connectedAt: new Date(),
      tenantId: process.env.ZOHO_ORGANIZATION_ID ?? null,
      providerTenantName: process.env.ZOHO_PROVIDER_TENANT_NAME ?? "Zoho Mail",
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
        healthDetail: health.detail,
        lastHealthAt: new Date(),
        tenantId: process.env.ZOHO_ORGANIZATION_ID ?? null,
        providerTenantName: process.env.ZOHO_PROVIDER_TENANT_NAME ?? "Zoho Mail",
        updatedAt: new Date(),
      },
    });
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "provider.zoho.connected",
  });
  revalidatePath("/email");
  return { ok: true, message: "Zoho Mail provider connected." };
}

async function importProviderMailboxesAction(providerKind: "microsoft_365" | "zoho_mail"): Promise<EmailActionResult> {
  const user = await requireUser();
  const providerName = providerDisplayName(providerKind);
  if (user.workspaceRole !== "owner" && user.workspaceRole !== "admin") {
    return { ok: false, error: `Only owners and admins can import ${providerName} mailboxes.` };
  }
  const [providerConnection] = await db
    .select()
    .from(schema.emailProviderConnections)
    .where(
      and(
        eq(schema.emailProviderConnections.workspaceId, user.workspaceId),
        eq(schema.emailProviderConnections.provider, providerKind),
      ),
    )
    .orderBy(desc(schema.emailProviderConnections.createdAt))
    .limit(1);
  if (!providerConnection) return { ok: false, error: `Connect ${providerName} before importing mailboxes.` };

  const provider = getEmailProvider(providerKind);
  const result = await provider.listMailboxes({ domain: providerConnection.domain });
  if (!result.ok) {
    await auditEmailEvent({
      workspaceId: user.workspaceId,
      actorId: user.id,
      action: "mailbox.import.failed",
      metadata: { provider: providerKind, error: result.error, providerStatus: result.providerStatus },
    });
    return { ok: false, error: result.error };
  }

  const members = await db
    .select({ userId: schema.users.id, email: schema.users.email })
    .from(schema.workspaceMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
    .where(eq(schema.workspaceMembers.workspaceId, user.workspaceId));
  const memberByEmail = new Map(members.map((member) => [normalizeEmail(member.email), member.userId]));

  for (const mailbox of result.mailboxes) {
    const ownerUserId = memberByEmail.get(mailbox.address) ?? null;
    const type = mailbox.typeHint ?? (ownerUserId ? "personal" : "shared");
    const imported = await upsertMailboxFromProvider({
      user,
      providerConnectionId: providerConnection.id,
      providerMailbox: mailbox,
      type,
      ownerUserId,
      aiEnabled: type === "shared",
    });
    const desiredAccess: DesiredAccessGrant[] = ownerUserId
      ? [
          {
            userId: ownerUserId,
            userEmail: mailbox.address,
            fullAccess: true,
            sendAs: true,
            rights: OWNER_RIGHTS,
          },
        ]
      : [];
    if (desiredAccess.length > 0) {
      await mirrorDesiredCrmAccess({
        user,
        mailboxId: imported.id,
        desiredAccess,
        auditAction: "mailbox.import.crm_access_mirrored",
      });
    }
    await db.insert(schema.emailProvisioningRequests).values({
      workspaceId: user.workspaceId,
      providerConnectionId: providerConnection.id,
      kind: "import_existing",
      status: "completed",
      targetEmail: mailbox.address,
      displayName: mailbox.displayName,
      targetUserId: ownerUserId,
      targetMailboxId: imported.id,
      requestedBy: user.id,
      completedBy: user.id,
      desiredAccess,
      providerPlan: {
        provider: providerKind,
        mode: "automatic",
        notes: [`Imported existing ${providerName} mailbox into CRM access model.`],
      },
      providerResult: {
        providerMailboxId: mailbox.providerMailboxId,
        type,
      },
      completedAt: new Date(),
    });
  }
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "mailbox.imported",
    metadata: { provider: providerKind, count: result.mailboxes.length },
  });
  revalidatePath("/email");
  return { ok: true, message: `Imported ${result.mailboxes.length} ${providerName} mailbox records.` };
}

export async function importMicrosoftMailboxesAction(): Promise<EmailActionResult> {
  return importProviderMailboxesAction("microsoft_365");
}

export async function importZohoMailboxesAction(): Promise<EmailActionResult> {
  return importProviderMailboxesAction("zoho_mail");
}

export async function classifyMailboxAction(input: unknown): Promise<EmailActionResult> {
  const user = await requireUser();
  if (!requireEmailAdmin(user)) return { ok: false, error: "Only owners and admins can classify mailboxes." };
  const parsed = classifyMailboxSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid mailbox classification." };
  const mailbox = await getMailboxForAction(user, parsed.data.mailboxId);
  if (!mailbox) return { ok: false, error: "Mailbox not found." };

  let ownerUserId = parsed.data.ownerUserId ?? null;
  if (parsed.data.type === "personal") {
    if (!ownerUserId) {
      const [ownerByEmail] = await db
        .select({ userId: schema.users.id })
        .from(schema.workspaceMembers)
        .innerJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
        .where(
          and(
            eq(schema.workspaceMembers.workspaceId, user.workspaceId),
            eq(schema.users.email, mailbox.mailbox.address),
          ),
        )
        .limit(1);
      ownerUserId = ownerByEmail?.userId ?? null;
    }
    if (!ownerUserId) return { ok: false, error: "Choose a workspace member for a personal mailbox." };
    const [member] = await db
      .select()
      .from(schema.workspaceMembers)
      .where(and(eq(schema.workspaceMembers.workspaceId, user.workspaceId), eq(schema.workspaceMembers.userId, ownerUserId)))
      .limit(1);
    if (!member) return { ok: false, error: "Mailbox owner must be a workspace member." };
  } else {
    ownerUserId = null;
  }

  await db
    .update(schema.emailMailboxes)
    .set({
      type: parsed.data.type,
      ownerUserId,
      aiEnabled: parsed.data.type === "shared" ? mailbox.mailbox.aiEnabled : false,
      updatedAt: new Date(),
    })
    .where(eq(schema.emailMailboxes.id, mailbox.mailbox.id));
  if (ownerUserId) {
    await mirrorDesiredCrmAccess({
      user,
      mailboxId: mailbox.mailbox.id,
      desiredAccess: [
        {
          userId: ownerUserId,
          fullAccess: true,
          sendAs: true,
          rights: OWNER_RIGHTS,
        },
      ],
      auditAction: "mailbox.classification.owner_access_mirrored",
    });
  }
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: mailbox.mailbox.id,
    action: "mailbox.classified",
    metadata: { type: parsed.data.type, ownerUserId },
  });
  revalidatePath("/email");
  return { ok: true, message: "Mailbox classification updated." };
}

export async function provisionSharedInboxAction(input: unknown): Promise<EmailActionResult> {
  const user = await requireUser();
  if (!requireEmailAdmin(user)) return { ok: false, error: "Only owners and admins can provision shared inboxes." };
  const parsed = provisionSharedInboxSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid shared inbox request." };
  const addressResult = ensureCaneyCloudAddress(parsed.data.address);
  if (!addressResult.ok) return { ok: false, error: addressResult.error };
  const providerState = await requireProvisioningProvider({
    user,
    action: "mailbox.provision.shared.blocked_provider_unavailable",
  });
  if (!providerState.ok) return { ok: false, error: providerState.error };

  const [existingMailbox] = await db
    .select()
    .from(schema.emailMailboxes)
    .where(and(eq(schema.emailMailboxes.workspaceId, user.workspaceId), eq(schema.emailMailboxes.address, addressResult.address)))
    .limit(1);
  if (existingMailbox) return { ok: false, error: "That mailbox already exists in CRM." };

  const selectedUserIds = [...new Set([user.id, ...parsed.data.userIds])];
  const members = await loadMembersByIds(user, selectedUserIds);
  if (members.length !== selectedUserIds.length) return { ok: false, error: "Every selected user must be a workspace member." };
  const desiredAccess: DesiredAccessGrant[] = members.map((member) => ({
    userId: member.userId,
    userEmail: normalizeEmail(member.email),
    fullAccess: true,
    sendAs: true,
    rights: member.userId === user.id ? OWNER_RIGHTS : RESPONDER_RIGHTS,
  }));
  const [request] = await db
    .insert(schema.emailProvisioningRequests)
    .values({
      workspaceId: user.workspaceId,
      providerConnectionId: providerState.providerConnection.id,
      kind: "shared_mailbox",
      status: "requested",
      targetEmail: addressResult.address,
      displayName: parsed.data.displayName,
      requestedBy: user.id,
      desiredAccess,
      providerPlan: {
        provider: providerState.providerConnection.provider,
        mode: providerState.providerConnection.provider === "sandbox" ? "automatic" : "manual",
      },
    })
    .returning();
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "mailbox.provision.shared.requested",
    metadata: { requestId: request.id, address: addressResult.address, users: desiredAccess.map((grant) => grant.userId) },
  });

  const provider = getEmailProvider(providerState.providerConnection.provider);
  const provisionResult =
    (await provider.provisionSharedMailbox?.({
      domain: providerState.providerConnection.domain,
      address: addressResult.address,
      displayName: parsed.data.displayName,
      requestedByEmail: user.email,
    })) ?? {
      ok: true as const,
      mode: "provider_pending" as const,
      message: "Provider does not support automatic shared mailbox creation.",
      manualSteps: ["Create the shared mailbox in the provider admin console, then import it."],
    };
  if (!provisionResult.ok) {
    await db
      .update(schema.emailProvisioningRequests)
      .set({
        status: "failed",
        providerError: provisionResult.error,
        providerResult: resultMetadata(provisionResult),
        updatedAt: new Date(),
      })
      .where(eq(schema.emailProvisioningRequests.id, request.id));
    await auditEmailEvent({
      workspaceId: user.workspaceId,
      actorId: user.id,
      action: "mailbox.provision.shared.failed",
      metadata: { requestId: request.id, error: provisionResult.error },
    });
    revalidatePath("/email");
    return { ok: false, error: provisionResult.error };
  }

  const permissionResult = await provider.applyMailboxPermissions?.({
    mailboxAddress: addressResult.address,
    grants: providerGrantsFromDesired(desiredAccess),
    requestedByEmail: user.email,
  });
  if (provisionResult.mode === "completed" && provisionResult.mailbox) {
    const mailbox = await upsertMailboxFromProvider({
      user,
      providerConnectionId: providerState.providerConnection.id,
      providerMailbox: provisionResult.mailbox,
      type: "shared",
      aiEnabled: true,
    });
    await mirrorDesiredCrmAccess({
      user,
      mailboxId: mailbox.id,
      desiredAccess,
      auditAction: "mailbox.provision.shared.crm_access_mirrored",
    });
    await db
      .update(schema.emailProvisioningRequests)
      .set({
        status: "completed",
        targetMailboxId: mailbox.id,
        completedBy: user.id,
        completedAt: new Date(),
        providerResult: {
          provision: resultMetadata(provisionResult),
          permissions: permissionResult ? resultMetadata(permissionResult) : null,
        },
        updatedAt: new Date(),
      })
      .where(eq(schema.emailProvisioningRequests.id, request.id));
    await auditEmailEvent({
      workspaceId: user.workspaceId,
      actorId: user.id,
      mailboxId: mailbox.id,
      action: "mailbox.provision.shared.completed",
      metadata: { requestId: request.id, address: addressResult.address },
    });
    revalidatePath("/email");
    return { ok: true, id: mailbox.id, message: provisionResult.message };
  }

  await db
    .update(schema.emailProvisioningRequests)
    .set({
      status: "provider_pending",
      providerPlan: {
        provider: providerState.providerConnection.provider,
        mode: "manual",
        manualSteps: [...(provisionResult.manualSteps ?? []), ...(permissionResult?.ok ? permissionResult.manualSteps ?? [] : [])],
      },
      providerResult: {
        provision: resultMetadata(provisionResult),
        permissions: permissionResult ? resultMetadata(permissionResult) : null,
      },
      nextCheckAt: provisionResult.nextCheckAfter ?? new Date(Date.now() + 15 * 60 * 1000),
      updatedAt: new Date(),
    })
    .where(eq(schema.emailProvisioningRequests.id, request.id));
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "mailbox.provision.shared.provider_pending",
    metadata: { requestId: request.id, address: addressResult.address },
  });
  revalidatePath("/email");
  return { ok: true, id: request.id, message: provisionResult.message };
}

export async function provisionTeamMemberMailboxAction(input: unknown): Promise<EmailActionResult> {
  const user = await requireUser();
  if (!requireEmailAdmin(user)) return { ok: false, error: "Only owners and admins can provision team member mailboxes." };
  const parsed = provisionTeamMemberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid team member request." };
  const addressResult = ensureCaneyCloudAddress(parsed.data.email);
  if (!addressResult.ok) return { ok: false, error: addressResult.error };
  const providerState = await requireProvisioningProvider({
    user,
    action: "mailbox.provision.team_member.blocked_provider_unavailable",
  });
  if (!providerState.ok) return { ok: false, error: providerState.error };
  const [existingMailbox] = await db
    .select()
    .from(schema.emailMailboxes)
    .where(and(eq(schema.emailMailboxes.workspaceId, user.workspaceId), eq(schema.emailMailboxes.address, addressResult.address)))
    .limit(1);
  if (existingMailbox) return { ok: false, error: "That mailbox already exists in CRM." };

  const targetUser = await ensureCrmUserAndMembership({
    workspaceId: user.workspaceId,
    email: addressResult.address,
    displayName: parsed.data.displayName,
  });
  const selectedMembers = await loadMembersByIds(user, [...new Set([targetUser.id, user.id])]);
  const memberById = new Map(selectedMembers.map((member) => [member.userId, member]));
  const desiredAccess: DesiredAccessGrant[] = [
    {
      userId: targetUser.id,
      userEmail: addressResult.address,
      fullAccess: true,
      sendAs: true,
      rights: OWNER_RIGHTS,
    },
    ...(targetUser.id === user.id
      ? []
      : [
          {
            userId: user.id,
            userEmail: normalizeEmail(memberById.get(user.id)?.email ?? user.email),
            fullAccess: true,
            sendAs: true,
            rights: OWNER_RIGHTS,
          },
        ]),
  ];
  const [request] = await db
    .insert(schema.emailProvisioningRequests)
    .values({
      workspaceId: user.workspaceId,
      providerConnectionId: providerState.providerConnection.id,
      kind: "team_member",
      status: "requested",
      targetEmail: addressResult.address,
      displayName: parsed.data.displayName,
      targetUserId: targetUser.id,
      requestedBy: user.id,
      desiredAccess,
      providerPlan: {
        provider: providerState.providerConnection.provider,
        mode: providerState.providerConnection.provider === "sandbox" ? "automatic" : "hybrid",
      },
    })
    .returning();
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "mailbox.provision.team_member.requested",
    metadata: { requestId: request.id, targetUserId: targetUser.id, email: addressResult.address },
  });

  const provider = getEmailProvider(providerState.providerConnection.provider);
  const provisionResult =
    (await provider.provisionTeamMemberMailbox?.({
      domain: providerState.providerConnection.domain,
      email: addressResult.address,
      displayName: parsed.data.displayName,
      requestedByEmail: user.email,
      temporaryPassword: parsed.data.temporaryPassword,
      usageLocation: parsed.data.usageLocation,
    })) ?? {
      ok: true as const,
      mode: "provider_pending" as const,
      message: "Provider does not support automatic team member mailbox creation.",
      manualSteps: ["Create the user and mailbox in the provider admin console, then import it."],
    };
  if (!provisionResult.ok) {
    await db
      .update(schema.emailProvisioningRequests)
      .set({
        status: "failed",
        providerError: provisionResult.error,
        providerResult: resultMetadata(provisionResult),
        updatedAt: new Date(),
      })
      .where(eq(schema.emailProvisioningRequests.id, request.id));
    await auditEmailEvent({
      workspaceId: user.workspaceId,
      actorId: user.id,
      action: "mailbox.provision.team_member.failed",
      metadata: { requestId: request.id, error: provisionResult.error },
    });
    revalidatePath("/email");
    return { ok: false, error: provisionResult.error };
  }

  if (provisionResult.mode === "completed" && provisionResult.mailbox) {
    const mailbox = await upsertMailboxFromProvider({
      user,
      providerConnectionId: providerState.providerConnection.id,
      providerMailbox: provisionResult.mailbox,
      type: "personal",
      ownerUserId: targetUser.id,
      aiEnabled: false,
    });
    await mirrorDesiredCrmAccess({
      user,
      mailboxId: mailbox.id,
      desiredAccess,
      auditAction: "mailbox.provision.team_member.crm_access_mirrored",
    });
    await db
      .update(schema.emailProvisioningRequests)
      .set({
        status: "completed",
        targetMailboxId: mailbox.id,
        completedBy: user.id,
        completedAt: new Date(),
        providerResult: resultMetadata(provisionResult),
        updatedAt: new Date(),
      })
      .where(eq(schema.emailProvisioningRequests.id, request.id));
    await auditEmailEvent({
      workspaceId: user.workspaceId,
      actorId: user.id,
      mailboxId: mailbox.id,
      action: "mailbox.provision.team_member.completed",
      metadata: { requestId: request.id, targetUserId: targetUser.id },
    });
    revalidatePath("/email");
    return { ok: true, id: mailbox.id, message: provisionResult.message };
  }

  await db
    .update(schema.emailProvisioningRequests)
    .set({
      status: "provider_pending",
      providerPlan: {
        provider: providerState.providerConnection.provider,
        mode: "hybrid",
        manualSteps: provisionResult.manualSteps ?? [],
      },
      providerResult: resultMetadata(provisionResult),
      nextCheckAt: provisionResult.nextCheckAfter ?? new Date(Date.now() + 15 * 60 * 1000),
      updatedAt: new Date(),
    })
    .where(eq(schema.emailProvisioningRequests.id, request.id));
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "mailbox.provision.team_member.provider_pending",
    metadata: { requestId: request.id, targetUserId: targetUser.id },
  });
  revalidatePath("/email");
  return { ok: true, id: request.id, message: provisionResult.message };
}

export async function checkProvisioningRequestAction(requestId: unknown): Promise<EmailActionResult> {
  const user = await requireUser();
  if (!requireEmailAdmin(user)) return { ok: false, error: "Only owners and admins can check provisioning requests." };
  const parsed = checkProvisioningRequestSchema.safeParse(requestId);
  if (!parsed.success) return { ok: false, error: "Invalid provisioning request." };
  const [request] = await db
    .select()
    .from(schema.emailProvisioningRequests)
    .where(and(eq(schema.emailProvisioningRequests.workspaceId, user.workspaceId), eq(schema.emailProvisioningRequests.id, parsed.data)))
    .limit(1);
  if (!request) return { ok: false, error: "Provisioning request not found." };
  if (request.status === "completed" && request.targetMailboxId) {
    return { ok: true, id: request.targetMailboxId, message: "Provisioning request is already complete." };
  }
  const [providerConnection] = request.providerConnectionId
    ? await db
        .select()
        .from(schema.emailProviderConnections)
        .where(eq(schema.emailProviderConnections.id, request.providerConnectionId))
        .limit(1)
    : [await getActiveProviderConnection(user)];
  if (!providerConnection) return { ok: false, error: "Provider connection not found." };
  if (providerConnection.status !== "connected") return { ok: false, error: `Email provider is ${providerConnection.status}.` };

  const provider = getEmailProvider(providerConnection.provider);
  const listResult = await provider.listMailboxes({ domain: providerConnection.domain });
  if (!listResult.ok) {
    await db
      .update(schema.emailProvisioningRequests)
      .set({
        status: "provider_pending",
        providerError: listResult.error,
        providerResult: { ...request.providerResult, readinessCheck: listResult },
        nextCheckAt: new Date(Date.now() + 15 * 60 * 1000),
        updatedAt: new Date(),
      })
      .where(eq(schema.emailProvisioningRequests.id, request.id));
    return { ok: false, error: listResult.error };
  }
  const providerMailbox = listResult.mailboxes.find((mailbox) => mailbox.address === request.targetEmail);
  if (!providerMailbox) {
    await db
      .update(schema.emailProvisioningRequests)
      .set({
        status: "provider_pending",
        providerResult: {
          ...request.providerResult,
          readinessCheck: {
            checkedAt: new Date().toISOString(),
            found: false,
          },
        },
        nextCheckAt: new Date(Date.now() + 15 * 60 * 1000),
        updatedAt: new Date(),
      })
      .where(eq(schema.emailProvisioningRequests.id, request.id));
    await auditEmailEvent({
      workspaceId: user.workspaceId,
      actorId: user.id,
      action: "mailbox.provision.check_pending",
      metadata: { requestId: request.id, targetEmail: request.targetEmail },
    });
    revalidatePath("/email");
    return { ok: true, id: request.id, message: "Mailbox is not visible in the provider yet." };
  }

  const type = request.kind === "team_member" ? "personal" : "shared";
  const mailbox = await upsertMailboxFromProvider({
    user,
    providerConnectionId: providerConnection.id,
    providerMailbox,
    type,
    ownerUserId: request.kind === "team_member" ? request.targetUserId : null,
    aiEnabled: type === "shared",
  });
  const desiredAccess = (request.desiredAccess ?? []) as DesiredAccessGrant[];
  await mirrorDesiredCrmAccess({
    user,
    mailboxId: mailbox.id,
    desiredAccess,
    auditAction: "mailbox.provision.check.crm_access_mirrored",
  });
  await db
    .update(schema.emailProvisioningRequests)
    .set({
      status: "completed",
      targetMailboxId: mailbox.id,
      completedBy: user.id,
      completedAt: new Date(),
      providerResult: {
        ...request.providerResult,
        readinessCheck: {
          checkedAt: new Date().toISOString(),
          found: true,
          providerMailboxId: providerMailbox.providerMailboxId,
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(schema.emailProvisioningRequests.id, request.id));
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: mailbox.id,
    action: "mailbox.provision.completed_after_check",
    metadata: { requestId: request.id, targetEmail: request.targetEmail },
  });
  revalidatePath("/email");
  return { ok: true, id: mailbox.id, message: "Mailbox imported and CRM access mirrored." };
}

async function syncProviderMailboxForUser(
  user: Awaited<ReturnType<typeof requireUser>>,
  mailbox: Awaited<ReturnType<typeof getMailboxForAction>>,
): Promise<EmailActionResult> {
  if (!mailbox) return { ok: false, error: "Mailbox not found." };
  const providerStatus = await requireConnectedProviderForMailbox({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: mailbox.mailbox.id,
    action: "sync.blocked_provider_unavailable",
  });
  if (!providerStatus.ok) return { ok: false, error: providerStatus.error };
  const providerKind = await providerKindForMailbox(mailbox.mailbox.id);
  const result = await syncMailboxCache({
    mailbox: mailbox.mailbox,
    providerKind,
    actorId: user.id,
    limit: 25,
  });
  revalidatePath("/email");
  return result.ok
    ? { ok: true, message: `Synced ${result.messageCount} provider messages.` }
    : { ok: false, error: result.error };
}

export async function syncSandboxMailboxAction(mailboxId?: string): Promise<EmailActionResult> {
  const user = await requireUser();
  let mailbox = mailboxId ? await getMailboxForAction(user, mailboxId) : null;
  if (!mailbox) {
    const [firstShared] = await db
      .select()
      .from(schema.emailMailboxes)
      .where(and(eq(schema.emailMailboxes.workspaceId, user.workspaceId), eq(schema.emailMailboxes.type, "shared")))
      .limit(1);
    if (!firstShared) {
      await seedSandboxEmailModule(user);
      revalidatePath("/email");
      return { ok: true, message: "Sandbox seeded." };
    }
    mailbox = await getMailboxForAction(user, firstShared.id);
  }
  if (!mailbox?.rights.canView) return { ok: false, error: "You cannot sync this mailbox." };
  if (!mailbox.mailbox.syncEnabled) {
    await auditEmailEvent({
      workspaceId: user.workspaceId,
      actorId: user.id,
      mailboxId: mailbox.mailbox.id,
      action: "sync.blocked_disabled",
    });
    return { ok: false, error: "Sync is disabled for this mailbox." };
  }
  const providerStatus = await requireConnectedProviderForMailbox({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: mailbox.mailbox.id,
    action: "sync.blocked_provider_unavailable",
  });
  if (!providerStatus.ok) return { ok: false, error: providerStatus.error };
  const providerKind = await providerKindForMailbox(mailbox.mailbox.id);
  if (providerKind !== "sandbox") {
    return syncProviderMailboxForUser(user, mailbox);
  }
  const stamp = Date.now();
  const subject = stamp % 2 === 0 ? "Updated operator proposal" : "Follow-up from new CaneyCloud lead";
  const result = await upsertIncomingMessage({
    workspaceId: user.workspaceId,
    mailboxId: mailbox.mailbox.id,
    providerThreadId: `sandbox-sync-${stamp}`,
    providerMessageId: `sandbox-sync-message-${stamp}`,
    internetMessageId: `<sandbox-sync-${stamp}@caneycloud.com>`,
    fromAddress: stamp % 2 === 0 ? "marta@example.com" : "newlead@example.com",
    fromName: stamp % 2 === 0 ? "Marta Lopez" : "New Lead",
    toRecipients: [mailbox.mailbox.address],
    subject,
    bodyText:
      stamp % 2 === 0
        ? "Quick update: we can do the Friday walkthrough. Please send the final checklist."
        : "We heard about CaneyCloud from another operator and want a short intro to pricing and onboarding.",
    receivedAt: new Date(),
  });
  await db
    .update(schema.emailMailboxes)
    .set({ lastSyncedAt: new Date(), lastSyncError: null, updatedAt: new Date() })
    .where(eq(schema.emailMailboxes.id, mailbox.mailbox.id));
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: mailbox.mailbox.id,
    threadId: result.threadId,
    action: "sandbox.sync",
  });
  revalidatePath("/email");
  return { ok: true, id: result.threadId, message: "Sandbox inbound message synced." };
}

export async function updateEmailThreadStatusAction(
  threadId: string,
  status: string,
): Promise<EmailActionResult> {
  const user = await requireUser();
  const parsed = threadStatusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Invalid status." };
  const thread = await getThreadForAction(user, threadId);
  if (!thread?.rights.canAssign) return { ok: false, error: "You cannot change this thread." };
  const now = new Date();
  const snoozedUntil = parsed.data === "snoozed" ? new Date(now.getTime() + DEFAULT_SNOOZE_MS) : null;
  await db
    .update(schema.emailThreads)
    .set({
      status: parsed.data,
      isUnread: parsed.data === "done" ? false : thread.thread.isUnread,
      snoozedUntil,
      updatedAt: now,
    })
    .where(eq(schema.emailThreads.id, threadId));
  await recalculateMailboxCounts(user.workspaceId, [thread.thread.mailboxId]);
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: thread.mailbox.id,
    threadId,
    action: `thread.status.${parsed.data}`,
    metadata: { snoozedUntil: snoozedUntil?.toISOString() },
  });
  revalidatePath("/email");
  return { ok: true, id: threadId };
}

async function listThreadProviderMessages(input: {
  workspaceId: string;
  threadId: string;
  mailboxId: string;
}) {
  return db
    .select({
      providerMessageId: schema.emailMessages.providerMessageId,
      direction: schema.emailMessages.direction,
      providerFolder: schema.emailMessages.providerFolder,
    })
    .from(schema.emailMessages)
    .where(
      and(
        eq(schema.emailMessages.workspaceId, input.workspaceId),
        eq(schema.emailMessages.threadId, input.threadId),
        eq(schema.emailMessages.mailboxId, input.mailboxId),
      ),
    );
}

export async function setEmailThreadReadStateAction(input: unknown): Promise<EmailActionResult> {
  const user = await requireUser();
  const parsed = readStateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid read state." };
  const thread = await getThreadForAction(user, parsed.data.threadId);
  if (!thread?.rights.canView) return { ok: false, error: "You cannot update this thread." };
  const messages = await listThreadProviderMessages({
    workspaceId: user.workspaceId,
    threadId: parsed.data.threadId,
    mailboxId: thread.mailbox.id,
  });
  const providerStatus = await requireConnectedProviderForMailbox({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: thread.mailbox.id,
    threadId: parsed.data.threadId,
    action: "thread.read_state.blocked_provider_unavailable",
  });
  if (!providerStatus.ok) return { ok: false, error: providerStatus.error };
  const providerMessageIds = messages.map((message) => message.providerMessageId);
  const providerKind = await providerKindForMailbox(thread.mailbox.id);
  const provider = getEmailProvider(providerKind);
  const result = await provider.markMessagesRead({
    mailbox: thread.mailboxRecord as MailboxRecord,
    providerMessageIds,
    isRead: !parsed.data.isUnread,
  });
  if (!result.ok) {
    await auditEmailEvent({
      workspaceId: user.workspaceId,
      actorId: user.id,
      mailboxId: thread.mailbox.id,
      threadId: parsed.data.threadId,
      action: "thread.read_state.failed",
      metadata: { error: result.error, providerStatus: result.providerStatus },
    });
    return { ok: false, error: result.error };
  }
  await db
    .update(schema.emailMessages)
    .set({ isRead: !parsed.data.isUnread })
    .where(
      and(
        eq(schema.emailMessages.workspaceId, user.workspaceId),
        eq(schema.emailMessages.threadId, parsed.data.threadId),
      ),
    );
  await db
    .update(schema.emailThreads)
    .set({ isUnread: parsed.data.isUnread, updatedAt: new Date() })
    .where(eq(schema.emailThreads.id, parsed.data.threadId));
  await recalculateMailboxCounts(user.workspaceId, [thread.mailbox.id]);
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: thread.mailbox.id,
    threadId: parsed.data.threadId,
    action: parsed.data.isUnread ? "thread.marked_unread" : "thread.marked_read",
    metadata: { providerChanged: result.changed },
  });
  revalidatePath("/email");
  return { ok: true, id: parsed.data.threadId };
}

export async function archiveEmailThreadAction(threadId: string): Promise<EmailActionResult> {
  const user = await requireUser();
  const parsed = z.string().uuid().safeParse(threadId);
  if (!parsed.success) return { ok: false, error: "Invalid thread id." };
  const thread = await getThreadForAction(user, parsed.data);
  if (!thread?.rights.canAssign) return { ok: false, error: "You cannot archive this thread." };
  const messages = await listThreadProviderMessages({
    workspaceId: user.workspaceId,
    threadId: parsed.data,
    mailboxId: thread.mailbox.id,
  });
  const providerMessageIds = messages
    .filter((message) => message.direction === "inbound" && message.providerFolder !== "archive")
    .map((message) => message.providerMessageId);
  const providerStatus = await requireConnectedProviderForMailbox({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: thread.mailbox.id,
    threadId: parsed.data,
    action: "thread.archive.blocked_provider_unavailable",
  });
  if (!providerStatus.ok) return { ok: false, error: providerStatus.error };
  const providerKind = await providerKindForMailbox(thread.mailbox.id);
  const provider = getEmailProvider(providerKind);
  const result = await provider.archiveMessages({
    mailbox: thread.mailboxRecord as MailboxRecord,
    providerMessageIds,
  });
  if (!result.ok) {
    await auditEmailEvent({
      workspaceId: user.workspaceId,
      actorId: user.id,
      mailboxId: thread.mailbox.id,
      threadId: parsed.data,
      action: "thread.archive.failed",
      metadata: { error: result.error, providerStatus: result.providerStatus },
    });
    return { ok: false, error: result.error };
  }
  await db
    .update(schema.emailMessages)
    .set({ providerFolder: "archive", isRead: true })
    .where(
      and(
        eq(schema.emailMessages.workspaceId, user.workspaceId),
        eq(schema.emailMessages.threadId, parsed.data),
        eq(schema.emailMessages.mailboxId, thread.mailbox.id),
        eq(schema.emailMessages.direction, "inbound"),
      ),
    );
  await db
    .update(schema.emailThreads)
    .set({ status: "done", isUnread: false, updatedAt: new Date() })
    .where(eq(schema.emailThreads.id, parsed.data));
  await recalculateMailboxCounts(user.workspaceId, [thread.mailbox.id]);
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: thread.mailbox.id,
    threadId: parsed.data,
    action: "thread.archived",
    metadata: { providerChanged: result.changed },
  });
  revalidatePath("/email");
  return { ok: true, id: parsed.data, message: "Thread archived." };
}

export async function bulkUpdateEmailThreadsAction(input: unknown): Promise<EmailActionResult> {
  const user = await requireUser();
  const parsed = bulkThreadUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid bulk action." };
  const data = parsed.data;
  if (data.assigneeUserId) {
    const [member] = await db
      .select()
      .from(schema.workspaceMembers)
      .where(
        and(
          eq(schema.workspaceMembers.workspaceId, user.workspaceId),
          eq(schema.workspaceMembers.userId, data.assigneeUserId),
        ),
      )
      .limit(1);
    if (!member) return { ok: false, error: "Assignee is not in this workspace." };
  }

  const mailboxIds = new Set<string>();
  let updated = 0;
  let skipped = 0;
  for (const threadId of data.threadIds) {
    const thread = await getThreadForAction(user, threadId);
    if (!thread?.rights.canAssign) {
      skipped += 1;
      continue;
    }
    const now = new Date();
    const snoozedUntil = data.status === "snoozed" ? new Date(now.getTime() + DEFAULT_SNOOZE_MS) : null;
    await db
      .update(schema.emailThreads)
      .set({
        ...(data.status
          ? {
              status: data.status,
              isUnread: data.status === "done" ? false : thread.thread.isUnread,
              snoozedUntil,
            }
          : {}),
        ...(data.assigneeUserId !== undefined ? { assignedToId: data.assigneeUserId } : {}),
        updatedAt: now,
      })
      .where(eq(schema.emailThreads.id, threadId));
    if (data.assigneeUserId && data.assigneeUserId !== user.id) {
      await notifyEmailAssignment({
        workspaceId: user.workspaceId,
        actorId: user.id,
        assigneeUserId: data.assigneeUserId,
        threadId,
        subject: thread.thread.subject,
      });
    }
    mailboxIds.add(thread.thread.mailboxId);
    updated += 1;
  }
  await recalculateMailboxCounts(user.workspaceId, [...mailboxIds]);
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "thread.bulk_updated",
    metadata: {
      requested: data.threadIds.length,
      updated,
      skipped,
      status: data.status,
      assigneeUserId: data.assigneeUserId,
    },
  });
  revalidatePath("/email");
  return {
    ok: true,
    message: skipped > 0 ? `Updated ${updated}; skipped ${skipped} unauthorized.` : `Updated ${updated} threads.`,
  };
}

export async function assignEmailThreadAction(
  threadId: string,
  assigneeUserId: string | null,
): Promise<EmailActionResult> {
  const user = await requireUser();
  const thread = await getThreadForAction(user, threadId);
  if (!thread?.rights.canAssign) return { ok: false, error: "You cannot assign this thread." };
  if (assigneeUserId) {
    const [member] = await db
      .select()
      .from(schema.workspaceMembers)
      .where(
        and(
          eq(schema.workspaceMembers.workspaceId, user.workspaceId),
          eq(schema.workspaceMembers.userId, assigneeUserId),
        ),
      )
      .limit(1);
    if (!member) return { ok: false, error: "Assignee is not in this workspace." };
  }
  await db
    .update(schema.emailThreads)
    .set({ assignedToId: assigneeUserId, updatedAt: new Date() })
    .where(eq(schema.emailThreads.id, threadId));
  if (assigneeUserId && assigneeUserId !== user.id) {
    await notifyEmailAssignment({
      workspaceId: user.workspaceId,
      actorId: user.id,
      assigneeUserId,
      threadId,
      subject: thread.thread.subject,
    });
  }
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: thread.mailbox.id,
    threadId,
    action: "thread.assigned",
    metadata: { assigneeUserId },
  });
  revalidatePath("/email");
  return { ok: true, id: threadId };
}

export async function addEmailInternalNoteAction(
  threadId: string,
  body: string,
): Promise<EmailActionResult> {
  const user = await requireUser();
  const thread = await getThreadForAction(user, threadId);
  if (!thread?.rights.canView) return { ok: false, error: "You cannot add notes to this thread." };
  const clean = body.trim();
  if (!clean) return { ok: false, error: "Write a note first." };
  const [note] = await db
    .insert(schema.emailInternalNotes)
    .values({
      workspaceId: user.workspaceId,
      threadId,
      authorUserId: user.id,
      body: clean,
    })
    .returning();
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: thread.mailbox.id,
    threadId,
    action: "thread.internal_note.created",
  });
  revalidatePath("/email");
  return { ok: true, id: note.id };
}

export async function recordOwnerMailboxAccessAction(
  mailboxId: string,
  reason: string,
): Promise<EmailActionResult> {
  const user = await requireUser();
  if (user.workspaceRole !== "owner") return { ok: false, error: "Only owners can record personal mailbox access." };
  const mailbox = await getMailboxForAction(user, mailboxId);
  if (!mailbox?.rights.canView) return { ok: false, error: "Mailbox not found." };
  if (mailbox.mailbox.type !== "personal" || mailbox.mailbox.ownerUserId === user.id) {
    return { ok: true, message: "No owner audit needed for this mailbox." };
  }
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId,
    action: "owner.personal_mailbox.viewed",
    reason: reason.trim() || "Owner operational review",
  });
  revalidatePath("/email");
  return { ok: true };
}

export async function linkEmailThreadToContactAction(
  threadId: string,
  contactId: string,
): Promise<EmailActionResult> {
  const user = await requireUser();
  const thread = await getThreadForAction(user, threadId);
  if (!thread?.rights.canView) return { ok: false, error: "Thread not found." };
  const [contact] = await db
    .select()
    .from(schema.contacts)
    .where(and(eq(schema.contacts.workspaceId, user.workspaceId), eq(schema.contacts.id, contactId)))
    .limit(1);
  if (!contact) return { ok: false, error: "Contact not found." };
  await linkEmailThread({
    workspaceId: user.workspaceId,
    actorId: user.id,
    threadId,
    linkType: "contact",
    refId: contact.id,
    label: contact.name,
  });
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: thread.mailbox.id,
    threadId,
    action: "thread.link.contact",
    metadata: { contactId },
  });
  revalidatePath("/email");
  return { ok: true, id: contact.id };
}

export async function linkEmailThreadToProjectAction(
  threadId: string,
  projectId: string,
): Promise<EmailActionResult> {
  const user = await requireUser();
  const thread = await getThreadForAction(user, threadId);
  if (!thread?.rights.canView) return { ok: false, error: "Thread not found." };
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.workspaceId, user.workspaceId), eq(schema.projects.id, projectId)))
    .limit(1);
  if (!project) return { ok: false, error: "Project not found." };
  await linkEmailThread({
    workspaceId: user.workspaceId,
    actorId: user.id,
    threadId,
    linkType: "project",
    refId: project.id,
    label: project.title,
  });
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: thread.mailbox.id,
    threadId,
    action: "thread.link.project",
    metadata: { projectId },
  });
  revalidatePath("/email");
  return { ok: true, id: project.id };
}

export async function linkEmailThreadToInitiativeAction(
  threadId: string,
  initiativeId: string,
): Promise<EmailActionResult> {
  const user = await requireUser();
  const thread = await getThreadForAction(user, threadId);
  if (!thread?.rights.canView) return { ok: false, error: "Thread not found." };
  const [initiative] = await db
    .select()
    .from(schema.initiatives)
    .where(and(eq(schema.initiatives.workspaceId, user.workspaceId), eq(schema.initiatives.id, initiativeId)))
    .limit(1);
  if (!initiative) return { ok: false, error: "Initiative not found." };
  await linkEmailThread({
    workspaceId: user.workspaceId,
    actorId: user.id,
    threadId,
    linkType: "initiative",
    refId: initiative.id,
    label: initiative.title,
  });
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: thread.mailbox.id,
    threadId,
    action: "thread.link.initiative",
    metadata: { initiativeId },
  });
  revalidatePath("/email");
  revalidatePath("/initiatives");
  return { ok: true, id: initiative.id };
}

export async function linkEmailThreadToMilestoneAction(
  threadId: string,
  milestoneId: string,
): Promise<EmailActionResult> {
  const user = await requireUser();
  const thread = await getThreadForAction(user, threadId);
  if (!thread?.rights.canView) return { ok: false, error: "Thread not found." };
  const [milestone] = await db
    .select({
      id: schema.milestones.id,
      title: schema.milestones.title,
      projectId: schema.milestones.projectId,
    })
    .from(schema.milestones)
    .where(and(eq(schema.milestones.workspaceId, user.workspaceId), eq(schema.milestones.id, milestoneId)))
    .limit(1);
  if (!milestone) return { ok: false, error: "Milestone not found." };
  await linkEmailThread({
    workspaceId: user.workspaceId,
    actorId: user.id,
    threadId,
    linkType: "milestone",
    refId: milestone.id,
    label: milestone.title,
  });
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: thread.mailbox.id,
    threadId,
    action: "thread.link.milestone",
    metadata: { milestoneId },
  });
  revalidatePath("/email");
  revalidatePath("/work");
  revalidatePath(`/projects/${milestone.projectId}`);
  return { ok: true, id: milestone.id };
}

export async function createContactFromEmailThreadAction(
  threadId: string,
): Promise<EmailActionResult> {
  const user = await requireUser();
  const thread = await getThreadForAction(user, threadId);
  if (!thread?.rights.canView) return { ok: false, error: "Thread not found." };
  const [message] = await db
    .select()
    .from(schema.emailMessages)
    .where(
      and(
        eq(schema.emailMessages.workspaceId, user.workspaceId),
        eq(schema.emailMessages.threadId, threadId),
        eq(schema.emailMessages.direction, "inbound"),
      ),
    )
    .orderBy(schema.emailMessages.createdAt)
    .limit(1);
  if (!message) return { ok: false, error: "No inbound sender to convert." };
  const contact = await findOrCreateContactFromEmail({
    workspaceId: user.workspaceId,
    actorId: user.id,
    email: message.fromAddress,
    name: message.fromName,
  });
  await linkEmailThread({
    workspaceId: user.workspaceId,
    actorId: user.id,
    threadId,
    linkType: "contact",
    refId: contact.id,
    label: contact.name,
  });
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: thread.mailbox.id,
    threadId,
    action: "thread.contact.created",
    metadata: { contactId: contact.id },
  });
  revalidatePath("/email");
  revalidatePath("/contacts");
  return { ok: true, id: contact.id };
}

export async function createActionItemFromEmailThreadAction(
  threadId: string,
  assigneeUserId?: string | null,
): Promise<EmailActionResult> {
  const user = await requireUser();
  const thread = await getThreadForAction(user, threadId);
  if (!thread?.rights.canView) return { ok: false, error: "Thread not found." };
  const [item] = await db
    .insert(schema.actionItems)
    .values({
      workspaceId: user.workspaceId,
      title: `Reply: ${thread.thread.subject}`,
      description: thread.thread.lastMessagePreview ?? null,
      priority: "now",
      assigneeUserId: assigneeUserId ?? user.id,
      createdBy: user.id,
    })
    .returning();
  await linkEmailThread({
    workspaceId: user.workspaceId,
    actorId: user.id,
    threadId,
    linkType: "action_item",
    refId: item.id,
    label: item.title,
  });
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: thread.mailbox.id,
    threadId,
    action: "thread.action_item.created",
    metadata: { actionItemId: item.id },
  });
  revalidatePath("/email");
  revalidatePath("/work");
  return { ok: true, id: item.id };
}

export async function logEmailThreadTouchAction(
  threadId: string,
  contactId?: string,
): Promise<EmailActionResult> {
  const user = await requireUser();
  const thread = await getThreadForAction(user, threadId);
  if (!thread?.rights.canView) return { ok: false, error: "Thread not found." };
  let resolvedContactId = contactId;
  if (!resolvedContactId) {
    const [link] = await db
      .select()
      .from(schema.emailThreadCrmLinks)
      .where(
        and(
          eq(schema.emailThreadCrmLinks.threadId, threadId),
          eq(schema.emailThreadCrmLinks.linkType, "contact"),
        ),
      )
      .limit(1);
    resolvedContactId = link?.refId;
  }
  if (!resolvedContactId) return { ok: false, error: "Link or choose a contact first." };
  const touch = await createTouchFromThread({
    workspaceId: user.workspaceId,
    actorId: user.id,
    threadId,
    contactId: resolvedContactId,
  });
  if (!touch) return { ok: false, error: "Could not create touch." };
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: thread.mailbox.id,
    threadId,
    action: "thread.touch.logged",
    metadata: { contactId: resolvedContactId },
  });
  revalidatePath("/email");
  revalidatePath("/contacts");
  return { ok: true, id: touch.id };
}

export async function saveEmailDraftAction(input: unknown): Promise<EmailActionResult> {
  const user = await requireUser();
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid draft." };
  const data = parsed.data;
  const mailbox = await getMailboxForAction(user, data.mailboxId);
  if (!mailbox?.rights.canReply) return { ok: false, error: "You cannot draft from this mailbox." };
  if (data.threadId) {
    const thread = await getThreadForAction(user, data.threadId);
    if (!thread?.rights.canReply || thread.thread.mailboxId !== data.mailboxId) {
      return { ok: false, error: "You cannot draft on this thread." };
    }
  }

  const normalizedAttachments = data.attachments.map((attachment) => ({
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    ...(attachment.contentBase64 ? { contentBase64: attachment.contentBase64 } : {}),
  }));
  const values = {
    threadId: data.threadId ?? null,
    mailboxId: data.mailboxId,
    toRecipients: data.to.map(normalizeEmail),
    ccRecipients: data.cc.map(normalizeEmail),
    bccRecipients: data.bcc.map(normalizeEmail),
    subject: data.subject,
    bodyText: data.bodyText,
    attachmentMetadata: normalizedAttachments,
    clientMutationId: data.clientMutationId,
    status: "draft" as const,
    updatedAt: new Date(),
  };

  let existingDraft: typeof schema.emailDrafts.$inferSelect | null = null;
  if (data.draftId) {
    [existingDraft = null] = await db
      .select()
      .from(schema.emailDrafts)
      .where(
        and(
          eq(schema.emailDrafts.id, data.draftId),
          eq(schema.emailDrafts.workspaceId, user.workspaceId),
          eq(schema.emailDrafts.authorUserId, user.id),
          eq(schema.emailDrafts.status, "draft"),
        ),
      )
      .limit(1);
  }
  if (!existingDraft) {
    [existingDraft = null] = await db
      .select()
      .from(schema.emailDrafts)
      .where(
        and(
          eq(schema.emailDrafts.workspaceId, user.workspaceId),
          eq(schema.emailDrafts.authorUserId, user.id),
          eq(schema.emailDrafts.clientMutationId, data.clientMutationId),
          eq(schema.emailDrafts.status, "draft"),
        ),
      )
      .orderBy(desc(schema.emailDrafts.updatedAt))
      .limit(1);
  }

  if (existingDraft) {
    await db.update(schema.emailDrafts).set(values).where(eq(schema.emailDrafts.id, existingDraft.id));
    revalidatePath("/email");
    return { ok: true, id: existingDraft.id, message: "Draft saved." };
  }

  const [draft] = await db
    .insert(schema.emailDrafts)
    .values({
      workspaceId: user.workspaceId,
      authorUserId: user.id,
      ...values,
    })
    .returning();
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: data.mailboxId,
    threadId: data.threadId ?? null,
    action: "draft.created",
    metadata: { clientMutationId: data.clientMutationId },
  });
  revalidatePath("/email");
  return { ok: true, id: draft.id, message: "Draft saved." };
}

export async function discardEmailDraftAction(draftId: string): Promise<EmailActionResult> {
  const user = await requireUser();
  const parsed = z.string().uuid().safeParse(draftId);
  if (!parsed.success) return { ok: false, error: "Invalid draft." };
  const [draft] = await db
    .select()
    .from(schema.emailDrafts)
    .where(
      and(
        eq(schema.emailDrafts.id, parsed.data),
        eq(schema.emailDrafts.workspaceId, user.workspaceId),
        eq(schema.emailDrafts.authorUserId, user.id),
        eq(schema.emailDrafts.status, "draft"),
      ),
    )
    .limit(1);
  if (!draft) return { ok: false, error: "Draft not found." };
  await db
    .update(schema.emailDrafts)
    .set({ status: "discarded", updatedAt: new Date() })
    .where(eq(schema.emailDrafts.id, draft.id));
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: draft.mailboxId,
    threadId: draft.threadId,
    action: "draft.discarded",
  });
  revalidatePath("/email");
  return { ok: true, message: "Draft discarded." };
}

export async function generateEmailActiveBrainAction(input: unknown): Promise<EmailActiveBrainResult> {
  const user = await requireUser();
  const parsed = activeBrainSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid Active Brain request." };
  const thread = await getEmailThreadDetail(user, parsed.data.threadId);
  if (!thread) return { ok: false, error: "Thread not found." };
  const mailbox = await getMailboxForAction(user, thread.mailboxId);
  if (!mailbox?.rights.canView) return { ok: false, error: "Thread not found." };
  if (!mailbox.mailbox.aiEnabled) {
    await auditEmailEvent({
      workspaceId: user.workspaceId,
      actorId: user.id,
      mailboxId: mailbox.mailbox.id,
      threadId: thread.id,
      action: "ai.blocked_policy",
      metadata: { reason: "mailbox_ai_disabled", mode: parsed.data.mode },
    });
    return { ok: false, error: "AI is disabled for this mailbox by policy." };
  }

  const summary = buildEmailAiSummary(thread);
  if (parsed.data.mode === "summary") {
    await auditEmailEvent({
      workspaceId: user.workspaceId,
      actorId: user.id,
      mailboxId: mailbox.mailbox.id,
      threadId: thread.id,
      action: "ai.summary.generated",
      metadata: { citations: summary.citations.map((citation) => citation.messageId) },
    });
    return { ok: true, summary, message: "AI summary generated." };
  }

  if (!mailbox.rights.canReply) return { ok: false, error: "You cannot draft from this mailbox." };
  const inbound = [...thread.messages].reverse().find((message) => message.direction === "inbound");
  if (!inbound) return { ok: false, error: "No inbound message to draft against." };
  const bodyText = buildEmailAiDraft(thread, summary);
  const [draft] = await db
    .insert(schema.emailDrafts)
    .values({
      workspaceId: user.workspaceId,
      threadId: thread.id,
      mailboxId: mailbox.mailbox.id,
      authorUserId: user.id,
      status: "draft",
      toRecipients: [normalizeEmail(inbound.fromAddress)],
      ccRecipients: [],
      bccRecipients: [],
      subject: thread.subject.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`,
      bodyText,
      attachmentMetadata: [],
      clientMutationId: `ai-${crypto.randomUUID()}`,
      aiGenerated: true,
      aiMetadata: {
        sourceThreadId: thread.id,
        citations: summary.citations,
        policy: "mailbox.ai_enabled",
      },
    })
    .returning();
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: mailbox.mailbox.id,
    threadId: thread.id,
    action: "ai.reply_draft.created",
    metadata: { draftId: draft.id, citations: summary.citations.map((citation) => citation.messageId) },
  });
  revalidatePath("/email");
  return { ok: true, summary, draftId: draft.id, draftBody: bodyText, message: "AI draft created." };
}

export async function getEmailWorkloadBriefingAction(): Promise<EmailWorkloadBriefingResult> {
  const user = await requireUser();
  const threads = await listEmailThreadsForUser(user);
  return { ok: true, briefing: buildEmailWorkloadBriefing(threads, user.id) };
}

async function providerKindForMailbox(mailboxId: string) {
  const provider = await providerConnectionForMailbox(mailboxId);
  return provider?.provider ?? "sandbox";
}

async function providerConnectionForMailbox(mailboxId: string) {
  const [row] = await db
    .select({
      provider: schema.emailProviderConnections.provider,
      status: schema.emailProviderConnections.status,
      healthStatus: schema.emailProviderConnections.healthStatus,
      healthDetail: schema.emailProviderConnections.healthDetail,
    })
    .from(schema.emailMailboxes)
    .innerJoin(
      schema.emailProviderConnections,
      eq(schema.emailProviderConnections.id, schema.emailMailboxes.providerConnectionId),
    )
    .where(eq(schema.emailMailboxes.id, mailboxId))
    .limit(1);
  return row ?? null;
}

function providerUnavailableMessage(provider: Awaited<ReturnType<typeof providerConnectionForMailbox>>) {
  if (!provider) return "No email provider is connected for this mailbox.";
  if (provider.status === "connected") return null;
  return `Email provider is ${provider.status}. Cached mail remains readable, but send, sync, archive, and read-state changes are disabled until provider health is restored.`;
}

async function requireConnectedProviderForMailbox(input: {
  workspaceId: string;
  actorId?: string | null;
  mailboxId: string;
  threadId?: string | null;
  action: string;
}) {
  const provider = await providerConnectionForMailbox(input.mailboxId);
  const error = providerUnavailableMessage(provider);
  if (!error) return { ok: true as const, provider: provider! };
  await auditEmailEvent({
    workspaceId: input.workspaceId,
    actorId: input.actorId ?? null,
    mailboxId: input.mailboxId,
    threadId: input.threadId ?? null,
    action: input.action,
    metadata: {
      provider: provider?.provider,
      status: provider?.status ?? "missing",
      healthStatus: provider?.healthStatus,
      healthDetail: provider?.healthDetail,
    },
  });
  return { ok: false as const, error };
}

export async function sendEmailAction(input: unknown): Promise<EmailActionResult> {
  const user = await requireUser();
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid email." };
  const data = parsed.data;
  const mailbox = await getMailboxForAction(user, data.mailboxId);
  if (!mailbox) return { ok: false, error: "Mailbox not found." };
  if (!mailbox.mailbox.sendEnabled) return { ok: false, error: "Sending is disabled for this mailbox." };
  if (!mailbox.rights.canReply || !mailbox.rights.canSendAs) {
    return { ok: false, error: "You cannot send from this mailbox." };
  }
  const providerStatus = await requireConnectedProviderForMailbox({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: mailbox.mailbox.id,
    threadId: data.threadId ?? null,
    action: "send.blocked_provider_unavailable",
  });
  if (!providerStatus.ok) return { ok: false, error: providerStatus.error };
  const providerKind = await providerKindForMailbox(data.mailboxId);
  if (!canProviderSendAs(mailbox.record as MailboxRecord, user.id)) {
    await auditEmailEvent({
      workspaceId: user.workspaceId,
      actorId: user.id,
      mailboxId: mailbox.mailbox.id,
      action: "send.provider_send_as_denied",
      metadata: { idempotencyKey: data.idempotencyKey },
    });
    return {
      ok: false,
      error: `Provider Send As is missing for this mailbox. Grant Send As in ${providerDisplayName(providerKind)} before sending.`,
    };
  }

  const [existingJob] = await db
    .select()
    .from(schema.emailSendJobs)
    .where(eq(schema.emailSendJobs.idempotencyKey, data.idempotencyKey))
    .limit(1);
  if (existingJob?.status === "sent") {
    return { ok: true, id: existingJob.providerMessageId ?? existingJob.id, message: "Already sent." };
  }
  if (existingJob?.status === "pending" || existingJob?.status === "sending") {
    return { ok: true, id: existingJob.id, message: "Send is already queued." };
  }
  if (existingJob?.status === "failed") {
    return { ok: false, error: existingJob.error ?? "This send already failed. Start a new draft to retry." };
  }

  const bodyWithSignature = mailbox.mailbox.signature
    ? `${data.bodyText.trim()}\n\n${mailbox.mailbox.signature.trim()}`.trim()
    : data.bodyText;
  const attachmentMetadata = data.attachments.map((attachment) => ({
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    ...(attachment.contentBase64 ? { contentBase64: attachment.contentBase64 } : {}),
  }));
  let draft: typeof schema.emailDrafts.$inferSelect | null = null;
  if (data.draftId) {
    [draft = null] = await db
      .select()
      .from(schema.emailDrafts)
      .where(
        and(
          eq(schema.emailDrafts.id, data.draftId),
          eq(schema.emailDrafts.workspaceId, user.workspaceId),
          eq(schema.emailDrafts.authorUserId, user.id),
        ),
      )
      .limit(1);
  }
  if (draft) {
    await db
      .update(schema.emailDrafts)
      .set({
        status: "queued",
        threadId: data.threadId ?? null,
        mailboxId: data.mailboxId,
        toRecipients: data.to.map(normalizeEmail),
        ccRecipients: data.cc.map(normalizeEmail),
        bccRecipients: data.bcc.map(normalizeEmail),
        subject: data.subject,
        bodyText: data.bodyText,
        attachmentMetadata,
        clientMutationId: data.idempotencyKey,
        updatedAt: new Date(),
      })
      .where(eq(schema.emailDrafts.id, draft.id));
  } else {
    [draft] = await db
      .insert(schema.emailDrafts)
      .values({
        workspaceId: user.workspaceId,
        threadId: data.threadId ?? null,
        mailboxId: data.mailboxId,
        authorUserId: user.id,
        status: "queued",
        toRecipients: data.to.map(normalizeEmail),
        ccRecipients: data.cc.map(normalizeEmail),
        bccRecipients: data.bcc.map(normalizeEmail),
        subject: data.subject,
        bodyText: data.bodyText,
        attachmentMetadata,
        clientMutationId: data.idempotencyKey,
      })
      .returning();
  }
  if (!draft) return { ok: false, error: "Could not create send draft." };
  const [job] = await db
    .insert(schema.emailSendJobs)
    .values({
      workspaceId: user.workspaceId,
      draftId: draft.id,
      mailboxId: data.mailboxId,
      actorId: user.id,
      idempotencyKey: data.idempotencyKey,
      status: "sending",
    })
    .onConflictDoNothing()
    .returning();
  if (!job) {
    const [queuedJob] = await db
      .select()
      .from(schema.emailSendJobs)
      .where(eq(schema.emailSendJobs.idempotencyKey, data.idempotencyKey))
      .limit(1);
    return { ok: true, id: queuedJob?.id, message: "Send is already queued." };
  }

  const provider = getEmailProvider(providerKind);
  const sendResult = await provider.send({
    user,
    mailbox: mailbox.record as MailboxRecord,
    input: { ...data, bodyText: bodyWithSignature },
  });
  if (!sendResult.ok) {
    await db
      .update(schema.emailSendJobs)
      .set({ status: "failed", error: sendResult.error, updatedAt: new Date() })
      .where(eq(schema.emailSendJobs.id, job.id));
    await db.update(schema.emailDrafts).set({ status: "draft", updatedAt: new Date() }).where(eq(schema.emailDrafts.id, draft.id));
    await auditEmailEvent({
      workspaceId: user.workspaceId,
      actorId: user.id,
      mailboxId: mailbox.mailbox.id,
      action: "send.failed",
      metadata: { error: sendResult.error, providerStatus: sendResult.providerStatus },
    });
    revalidatePath("/email");
    return { ok: false, error: sendResult.error };
  }

  let threadId = data.threadId ?? null;
  if (!threadId) {
    const [thread] = await db
      .insert(schema.emailThreads)
      .values({
        workspaceId: user.workspaceId,
        mailboxId: data.mailboxId,
        providerThreadId: `outbound-${data.idempotencyKey}`,
        subject: data.subject,
        status: "open",
        assignedToId: user.id,
        lastMessageAt: sendResult.sentAt,
        lastMessagePreview: previewText(bodyWithSignature),
        hasAttachments: data.attachments.length > 0,
        isUnread: false,
      })
      .returning();
    threadId = thread.id;
  }

  const [message] = await db
    .insert(schema.emailMessages)
    .values({
      workspaceId: user.workspaceId,
      threadId,
      mailboxId: data.mailboxId,
      providerMessageId: sendResult.providerMessageId,
      internetMessageId: `<${sendResult.providerMessageId}@caneycloud.com>`,
      direction: "outbound",
      fromAddress: mailbox.mailbox.address,
      fromName: mailbox.mailbox.displayName,
      toRecipients: data.to.map(normalizeEmail),
      ccRecipients: data.cc.map(normalizeEmail),
      bccRecipients: data.bcc.map(normalizeEmail),
      subject: data.subject,
      bodyText: bodyWithSignature,
      sentAt: sendResult.sentAt,
      isRead: true,
      providerFolder: "sent",
    })
    .onConflictDoNothing()
    .returning();
  if (message && data.attachments.length > 0) {
    await db
      .insert(schema.emailAttachments)
      .values(
        data.attachments.map((attachment, index) => ({
          workspaceId: user.workspaceId,
          messageId: message.id,
          providerAttachmentId: `outbound-${data.idempotencyKey}-${index}`,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
        })),
      )
      .onConflictDoNothing();
  }
  await db
    .update(schema.emailThreads)
    .set({
      lastMessageAt: sendResult.sentAt,
      lastMessagePreview: previewText(bodyWithSignature),
      ...(data.attachments.length > 0 ? { hasAttachments: true } : {}),
      isUnread: false,
      updatedAt: new Date(),
    })
    .where(eq(schema.emailThreads.id, threadId));
  await db.update(schema.emailDrafts).set({ status: "sent", updatedAt: new Date() }).where(eq(schema.emailDrafts.id, draft.id));
  await db
    .update(schema.emailSendJobs)
    .set({
      status: "sent",
      providerMessageId: sendResult.providerMessageId,
      updatedAt: new Date(),
    })
    .where(eq(schema.emailSendJobs.id, job.id));

  const [contactLink] = await db
    .select()
    .from(schema.emailThreadCrmLinks)
    .where(
      and(
        eq(schema.emailThreadCrmLinks.threadId, threadId),
        eq(schema.emailThreadCrmLinks.linkType, "contact"),
      ),
    )
    .limit(1);
  if (contactLink) {
    await createTouchFromThread({
      workspaceId: user.workspaceId,
      actorId: user.id,
      threadId,
      contactId: contactLink.refId,
    });
  }
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: mailbox.mailbox.id,
    threadId,
    messageId: message?.id ?? null,
    action: "send.sent",
    metadata: { to: data.to, idempotencyKey: data.idempotencyKey },
  });
  await recalculateMailboxCounts(user.workspaceId, [data.mailboxId]);
  revalidatePath("/email");
  return { ok: true, id: threadId, message: "Email sent." };
}

export async function grantMailboxAccessAction(input: {
  mailboxId: string;
  userId: string;
  canView: boolean;
  canReply: boolean;
  canSendAs: boolean;
  canAssign: boolean;
  canManageAccess: boolean;
  canManageSettings: boolean;
}): Promise<EmailActionResult> {
  const user = await requireUser();
  if (user.workspaceRole !== "owner" && user.workspaceRole !== "admin") {
    return { ok: false, error: "Only owners and admins can manage mailbox access." };
  }
  const mailbox = await getMailboxForAction(user, input.mailboxId);
  if (!mailbox?.rights.canManageAccess && user.workspaceRole !== "owner") {
    return { ok: false, error: "You cannot manage access for this mailbox." };
  }
  const [member] = await db
    .select()
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, user.workspaceId),
        eq(schema.workspaceMembers.userId, input.userId),
      ),
    )
    .limit(1);
  if (!member) return { ok: false, error: "User is not a workspace member." };
  const isRevoking =
    !input.canView &&
    !input.canReply &&
    !input.canSendAs &&
    !input.canAssign &&
    !input.canManageAccess &&
    !input.canManageSettings;
  if (isRevoking) {
    await db
      .delete(schema.emailMailboxAccess)
      .where(
        and(
          eq(schema.emailMailboxAccess.mailboxId, input.mailboxId),
          eq(schema.emailMailboxAccess.userId, input.userId),
        ),
      );
    await auditEmailEvent({
      workspaceId: user.workspaceId,
      actorId: user.id,
      mailboxId: input.mailboxId,
      action: "mailbox.access.revoked",
      metadata: { userId: input.userId },
    });
    revalidatePath("/email");
    return { ok: true, message: "Access revoked." };
  }
  await db
    .insert(schema.emailMailboxAccess)
    .values({
      workspaceId: user.workspaceId,
      mailboxId: input.mailboxId,
      userId: input.userId,
      canView: input.canView,
      canReply: input.canReply,
      canSendAs: input.canSendAs,
      canAssign: input.canAssign,
      canManageAccess: input.canManageAccess,
      canManageSettings: input.canManageSettings,
      grantedBy: user.id,
    })
    .onConflictDoUpdate({
      target: [schema.emailMailboxAccess.mailboxId, schema.emailMailboxAccess.userId],
      set: {
        canView: input.canView,
        canReply: input.canReply,
        canSendAs: input.canSendAs,
        canAssign: input.canAssign,
        canManageAccess: input.canManageAccess,
        canManageSettings: input.canManageSettings,
        grantedBy: user.id,
        grantedAt: new Date(),
      },
    });
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: input.mailboxId,
    action: "mailbox.access.granted",
    metadata: { userId: input.userId },
  });
  revalidatePath("/email");
  return { ok: true };
}

export async function setMailboxOperationalStateAction(
  mailboxId: string,
  updates: { sendEnabled?: boolean; syncEnabled?: boolean; aiEnabled?: boolean },
): Promise<EmailActionResult> {
  const user = await requireUser();
  const mailbox = await getMailboxForAction(user, mailboxId);
  if (!mailbox?.rights.canManageSettings) return { ok: false, error: "You cannot change mailbox settings." };
  await db
    .update(schema.emailMailboxes)
    .set({
      sendEnabled: updates.sendEnabled ?? mailbox.mailbox.sendEnabled,
      syncEnabled: updates.syncEnabled ?? mailbox.mailbox.syncEnabled,
      aiEnabled: updates.aiEnabled ?? mailbox.mailbox.aiEnabled,
      updatedAt: new Date(),
    })
    .where(eq(schema.emailMailboxes.id, mailboxId));
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId,
    action: "mailbox.operational_state.updated",
    metadata: updates,
  });
  revalidatePath("/email");
  return { ok: true };
}

export async function updateMailboxSignatureAction(
  mailboxId: string,
  signature: string,
): Promise<EmailActionResult> {
  const user = await requireUser();
  const parsedMailboxId = z.string().uuid().safeParse(mailboxId);
  const parsedSignature = z.string().max(2_000).safeParse(signature);
  if (!parsedMailboxId.success || !parsedSignature.success) {
    return { ok: false, error: "Invalid signature." };
  }
  const mailbox = await getMailboxForAction(user, parsedMailboxId.data);
  if (!mailbox?.rights.canManageSettings) return { ok: false, error: "You cannot change mailbox settings." };
  await db
    .update(schema.emailMailboxes)
    .set({
      signature: parsedSignature.data.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(schema.emailMailboxes.id, parsedMailboxId.data));
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    mailboxId: parsedMailboxId.data,
    action: "mailbox.signature.updated",
  });
  revalidatePath("/email");
  return { ok: true, message: "Signature saved." };
}

export async function parseRecipientsAction(value: string): Promise<string[]> {
  return splitEmails(value);
}

function csvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export type EmailAuditExportResult =
  | { ok: true; filename: string; csv: string }
  | { ok: false; error: string };

export async function exportEmailAuditAction(): Promise<EmailAuditExportResult> {
  const user = await requireUser();
  if (user.workspaceRole !== "owner" && user.workspaceRole !== "admin") {
    return { ok: false, error: "Only owners and admins can export email audit." };
  }
  const rows = await db
    .select({
      event: schema.emailAuditEvents,
      actorEmail: schema.users.email,
      mailboxAddress: schema.emailMailboxes.address,
    })
    .from(schema.emailAuditEvents)
    .leftJoin(schema.users, eq(schema.users.id, schema.emailAuditEvents.actorId))
    .leftJoin(schema.emailMailboxes, eq(schema.emailMailboxes.id, schema.emailAuditEvents.mailboxId))
    .where(eq(schema.emailAuditEvents.workspaceId, user.workspaceId))
    .orderBy(desc(schema.emailAuditEvents.createdAt));
  const header = [
    "created_at",
    "action",
    "actor_email",
    "mailbox",
    "thread_id",
    "message_id",
    "reason",
    "metadata",
  ];
  const lines = rows.map(({ event, actorEmail, mailboxAddress }) =>
    [
      event.createdAt,
      event.action,
      actorEmail,
      mailboxAddress,
      event.threadId,
      event.messageId,
      event.reason,
      JSON.stringify(event.metadata ?? {}),
    ]
      .map(csvValue)
      .join(","),
  );
  await auditEmailEvent({
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "audit.exported",
    metadata: { rowCount: rows.length },
  });
  return {
    ok: true,
    filename: `email-audit-${new Date().toISOString().slice(0, 10)}.csv`,
    csv: [header.join(","), ...lines].join("\n"),
  };
}
